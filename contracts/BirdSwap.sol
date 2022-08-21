// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IMoonbirds.sol";
import "./IncomingTransferSupport.sol";
import "./OutgoingTransferSupport.sol";

/// @title A trustless marketplace to buy/sell nested Moonbirds
/// @author tbtstl <t@zora.co>
contract BirdSwap is ReentrancyGuard, IERC721Receiver, IncomingTransferSupport, OutgoingTransferSupport, Ownable {

    IMoonbirds public immutable moonbirds;
    /// @notice The ask for a given NFT, if one exists
    /// @dev Moonbird token ID => Ask
    mapping(uint256 => Ask) public askForMoonbird;
    /// mapping of moonbird token id to the address that transferred it to the escrow from
    mapping(uint256 => address) public moonbirdTransferredFromOwner;

    bool public enforceDefaultRoyalties = false;
    uint256 public marketplaceFeeBps;
    address private marketplaceFeePayoutAddress;

    /// @notice The metadata for an ask
    /// @param seller The address of the seller placing the ask
    /// @param sellerFundsRecipient The address to send funds after the ask is filled
    /// @param askCurrency The address of the ERC-20, or address(0) for ETH, required to fill the ask
    /// @param askPrice The price to fill the ask
    struct Ask {
        address seller;
        address sellerFundsRecipient;
        address askCurrency;
        uint256 askPrice;
        uint256 royaltyFeeBps;
    }

    /// @notice Emitted when an ask is created
    /// @param tokenId The ERC-721 token ID of the created ask
    /// @param ask The metadata of the created ask
    event AskCreated(uint256 indexed tokenId, Ask ask);

    /// @notice Emitted when an ask price is updated
    /// @param tokenId The ERC-721 token ID of the updated ask
    /// @param ask The metadata of the updated ask
    event AskPriceUpdated(uint256 indexed tokenId, Ask ask);

    /// @notice Emitted when an ask is canceled
    /// @param tokenId The ERC-721 token ID of the canceled ask
    /// @param ask The metadata of the canceled ask
    event AskCanceled(uint256 indexed tokenId, Ask ask);

    /// @notice Emitted when an ask is filled
    /// @param tokenId The ERC-721 token ID of the filled ask
    /// @param buyer The buyer address of the filled ask
    /// @param ask The metadata of the filled ask
    event AskFilled(uint256 indexed tokenId, address indexed buyer, Ask ask);

    /// @notice Emitted when an bird is withdrawn without a sale by the original owner
    /// @param tokenId The ERC-721 token ID of the filled ask
    /// @param to The address the bird was withdrawn to
    event BirdWithdrawn(uint256 indexed tokenId, address to);

    /// @dev Allow only the seller of a specific token ID to call specific functions.
    modifier onlyTokenSeller(uint256 _tokenId) {
        require(
            msg.sender == moonbirds.ownerOf(_tokenId) || (isMoonbirdEscrowed(_tokenId) && moonbirdTransferredFromOwner[_tokenId] == msg.sender),
            "caller must be token owner or token must have already been sent by owner to the Birdswap contract"
        );
        _;
    }

    constructor(IMoonbirds _moonbirds,
        address _marketplaceFeePayoutAddress,
        uint256 _marketplaceFeeBps,
        address _wethAddress
    )
        IncomingTransferSupport()
        OutgoingTransferSupport(_wethAddress)
    {
        moonbirds = _moonbirds;
        marketplaceFeePayoutAddress = _marketplaceFeePayoutAddress;
        marketplaceFeeBps = _marketplaceFeeBps;
    }

    /// @notice Creates the ask for a given NFT
    /// @param _tokenId The ID of the Moonbird token to be sold
    /// @param _askPrice The price to fill the ask
    /// @param _royaltyFeeBps The basis points of royalties to pay to the Moonbird's token royalty payout address
    /// @param _askCurrency The address of the ERC-20 token required to fill, or address(0) for ETH
    /// @param _sellerFundsRecipient The address to send funds once the ask is filled
    function createAsk(
        uint256 _tokenId,
        uint256 _askPrice,
        uint256 _royaltyFeeBps,
        address _askCurrency,
        address _sellerFundsRecipient
    ) external onlyTokenSeller(_tokenId) nonReentrant {
        address tokenOwner = moonbirds.ownerOf(_tokenId);
        // If the Moonbird is already escrowed in BirdSwap, the ownerOf will return this contract's address.
        if (tokenOwner == address(this)) {
            tokenOwner = moonbirdTransferredFromOwner[_tokenId];
        }

        require(_royaltyFeeBps <= 10000, "createAsk royalty fee basis points must be less than or equal to 10000");
        require(_sellerFundsRecipient != address(0), "createAsk must specify _sellerFundsRecipient");

        // prevent multiple asks from being created for the same token ID
        if (askForMoonbird[_tokenId].seller != address(0)) {
            _cancelAsk(_tokenId);
        }

        askForMoonbird[_tokenId] = Ask({
            seller: tokenOwner,
            sellerFundsRecipient: _sellerFundsRecipient,
            askCurrency: _askCurrency,
            askPrice: _askPrice,
            royaltyFeeBps: _royaltyFeeBps
        });

        emit AskCreated(_tokenId, askForMoonbird[_tokenId]);
    }


    /// @notice Cancels the ask for a given NFT
    /// @param _tokenId The ID of the Moonbird token
    /// @param _shouldWithdrawBird boolean flag of whether or not to also withdraw the bird from escrow along with canceling the ask
    function cancelAsk(uint256 _tokenId, bool _shouldWithdrawBird) external onlyTokenSeller(_tokenId) nonReentrant {
        require(askForMoonbird[_tokenId].seller != address(0), "cancelAsk ask doesn't exist");

        _cancelAsk(_tokenId);

        if (_shouldWithdrawBird && isMoonbirdEscrowed(_tokenId)) {
            _withdrawBird(_tokenId);
        }
    }


    /// @notice Updates the ask price for a given Moonbird
    /// @param _tokenId The ID of the Moonbird token
    /// @param _askPrice The ask price to set
    /// @param _askCurrency The address of the ERC-20 token required to fill, or address(0) for ETH
    function setAskPrice(
        uint256 _tokenId,
        uint256 _askPrice,
        address _askCurrency
    ) external nonReentrant {
        Ask storage ask = askForMoonbird[_tokenId];

        require(ask.seller == msg.sender || (isMoonbirdEscrowed(_tokenId) && moonbirdTransferredFromOwner[_tokenId] == msg.sender), "setAskPrice must be seller");

        ask.askPrice = _askPrice;
        ask.askCurrency = _askCurrency;

        emit AskPriceUpdated(_tokenId, ask);
    }

    /// @notice Withdraws an Escrowed bird for a seller
    /// @dev note: cancelAsk is preferred for allowing a seller to withdrawing their bird
    function withdrawBird(uint256 _tokenId) external onlyTokenSeller(_tokenId) nonReentrant {
        _withdrawBird(_tokenId);
    }

    /// @notice Fills the ask for a given Moonbird, transferring the ETH/ERC-20 to the seller and Moonbird to the buyer
    /// @param _tokenId The ID of the Moonbird token
    /// @param _fillCurrency The address of the ERC-20 token using to fill, or address(0) for ETH
    /// @param _fillAmount The amount to fill the ask
    function fillAsk(
        uint256 _tokenId,
        address _fillCurrency,
        uint256 _fillAmount
    ) external payable nonReentrant {
        Ask storage ask = askForMoonbird[_tokenId];

        require(isMoonbirdEscrowed(_tokenId), "fillAsk The Moonbird associated with this ask must be escrowed within Birdswap before a purchase can be completed");
        require(ask.seller != address(0), "fillAsk must be active ask");
        require(ask.askCurrency == _fillCurrency, "fillAsk _fillCurrency must match ask currency");
        require(ask.askPrice == _fillAmount, "fillAsk _fillAmount must match ask amount");

        // Ensure ETH/ERC-20 payment from buyer is valid and take custody
        _handleIncomingTransfer(ask.askPrice, ask.askCurrency);

        // Payout marketplace fee
        uint256 remainingProfit = _handleMarketplaceFeePayout(ask.askPrice, ask.askCurrency);

        // Payout respective parties, payout royalties based on configuration
        remainingProfit = _handleRoyaltyPayout(remainingProfit, ask.askCurrency, ask.royaltyFeeBps, 0);

        // Transfer remaining ETH/ERC-20 to seller
        _handleOutgoingTransfer(ask.sellerFundsRecipient, remainingProfit, ask.askCurrency, 0);

        // Transfer nested moonbird to buyer
        moonbirds.safeTransferWhileNesting(address(this), msg.sender, _tokenId);
        delete moonbirdTransferredFromOwner[_tokenId];

        emit AskFilled(_tokenId, msg.sender, ask);

        delete askForMoonbird[_tokenId];
    }


    /// @dev The Moonbird must be transferred directly to this contract using safeTransferFromWhileNested by the owner
    /// This is because the Moonbird contract does not allow operators to transfer the NFT on the owner's behalf
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4) {
        moonbirdTransferredFromOwner[tokenId] = from;
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @dev Checks to see if a moonbird is escrowed within the Birdswap contract
    function isMoonbirdEscrowed(uint256 tokenId) public view returns (bool) {
        return address(this) == moonbirds.ownerOf(tokenId);
    }

    /// Set the marketplace fee in basis points
    function setMarketplaceFeeBps(uint256 _marketplaceFeeBps) external onlyOwner {
        marketplaceFeeBps = _marketplaceFeeBps;
    }

    /// Set the marketplace payout address
    function setMarketplaceFeePayoutAddress(address _marketplaceFeePayoutAddress) external onlyOwner {
        marketplaceFeePayoutAddress = _marketplaceFeePayoutAddress;
    }

    /// @notice Returns whether or not a particular ask is fufillable.
    /// Since Moonbird NFTs do not allow operators to transfer them between users while nested,
    /// Birdswap requires the NFT to be transferred to this contract by the user before an ask is fufillable
    /// @param _tokenId The ID of the Moonbird
    function isAskFufillable(uint256 _tokenId) external view returns (bool) {
        Ask storage ask = askForMoonbird[_tokenId];
        return ask.seller != address(0) && isMoonbirdEscrowed(_tokenId);
    }

    /// @dev Provide a way to withdraw any ether that may have been accidentally sent to this contract
    function release() external onlyOwner {
        uint256 balance = address(this).balance;

        Address.sendValue(payable(owner()), balance);
    }

    /// @dev Provide a way to withdraw any tokens that may have been accidentally sent to this contract
    function withdrawTokens(IERC20 token) public onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        token.transfer(owner(), balance);
    }

    /// @dev Deletes canceled and invalid asks
    /// @param _tokenId The ID of the ERC-721 token
    function _cancelAsk(uint256 _tokenId) private {
        emit AskCanceled(_tokenId, askForMoonbird[_tokenId]);

        delete askForMoonbird[_tokenId];
    }

    function _withdrawBird(uint256 _tokenId) private {
        moonbirds.safeTransferWhileNesting(address(this), moonbirdTransferredFromOwner[_tokenId], _tokenId);
        emit BirdWithdrawn(_tokenId, moonbirdTransferredFromOwner[_tokenId]);

        delete moonbirdTransferredFromOwner[_tokenId];
    }

    function _handleMarketplaceFeePayout(uint256 _amount, address _payoutCurrency) private returns (uint256) {
        // Get marketplace fee
        uint256 marketplaceFee = _getFeeAmount(_amount, marketplaceFeeBps);
        // payout marketplace fee
        _handleOutgoingTransfer(marketplaceFeePayoutAddress, marketplaceFee, _payoutCurrency, 50000);

        return _amount - marketplaceFee;
    }

    function _handleRoyaltyPayout(uint256 _amount, address _payoutCurrency, uint256 _royaltyFeeBps, uint256 _tokenId) private returns (uint256) {
        // If no fee, return initial amount
        if (_royaltyFeeBps == 0 && !enforceDefaultRoyalties) return _amount;

        // Get Moonbirds royalty payout address
        (address moonbirdsRoyaltyPayoutAddress, uint256 royaltyFee) = moonbirds.royaltyInfo(_tokenId, _amount);

        if (!enforceDefaultRoyalties) {
            // Get custom royalty fee
            royaltyFee = _getFeeAmount(_amount, _royaltyFeeBps);
        }

        // payout royalties
        _handleOutgoingTransfer(moonbirdsRoyaltyPayoutAddress, royaltyFee, _payoutCurrency, 50000);

        return _amount - royaltyFee;
    }

    function _getFeeAmount(uint256 _amount, uint256 feeBps) private pure returns (uint256) {
        return (_amount * feeBps) / 10000;
    }
}
