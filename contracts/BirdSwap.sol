// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "./IMoonbirds.sol";
import "./IBirdSwap.sol";
import "./BirdSwapStore.sol";

/// @title A trustless marketplace to buy/sell nested Moonbirds
/// @author Montana Wong <montanawong@gmail.com>
contract BirdSwap is IBirdSwap, UUPSUpgradeable, ReentrancyGuardUpgradeable, IERC721ReceiverUpgradeable, OwnableUpgradeable, BirdSwapStore {
    /// @dev Allow only the seller of a specific token ID to call specific functions.
    modifier onlyTokenSeller(uint256 _tokenId) {
        require(
            msg.sender == moonbirds.ownerOf(_tokenId) || (isMoonbirdEscrowed(_tokenId) && moonbirdTransferredFromOwner[_tokenId] == msg.sender),
            "caller must be token owner or token must have already been sent by owner to the Birdswap contract"
        );
        _;
    }

    constructor() initializer {
        // used to prevent logic contract self destruct take over
    }

    function initialize (
        IMoonbirds _moonbirds,
        address _marketplaceFeePayoutAddress,
        uint256 _marketplaceFeeBps
    ) public initializer
    {
        moonbirds = _moonbirds;
        marketplaceFeePayoutAddress = _marketplaceFeePayoutAddress;
        marketplaceFeeBps = _marketplaceFeeBps;
        enforceDefaultRoyalties = false;
    }

    /// @notice Creates the ask for a given NFT
    /// @param _tokenId The ID of the Moonbird token to be sold
    /// @param _buyer Address of the buyer
    /// @param _askPrice The price to fill the ask
    /// @param _royaltyFeeBps The basis points of royalties to pay to the Moonbird's token royalty payout address
    function createAsk(
        uint256 _tokenId,
        address _buyer,
        uint256 _askPrice,
        uint256 _royaltyFeeBps
    ) external onlyTokenSeller(_tokenId) nonReentrant {
        address tokenOwner = moonbirds.ownerOf(_tokenId);
        // If the Moonbird is already escrowed in BirdSwap, the ownerOf will return this contract's address.
        if (tokenOwner == address(this)) {
            tokenOwner = moonbirdTransferredFromOwner[_tokenId];
        }

        require(_royaltyFeeBps <= 10000, "createAsk royalty fee basis points must be less than or equal to 10000");

        // prevent multiple asks from being created for the same token ID
        if (askForMoonbird[_tokenId].seller != address(0)) {
            _cancelAsk(_tokenId);
        }

        askForMoonbird[_tokenId] = Ask({
            seller: tokenOwner,
            buyer: _buyer,
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
    function setAskPrice(
        uint256 _tokenId,
        uint256 _askPrice
    ) external nonReentrant {
        Ask storage ask = askForMoonbird[_tokenId];

        require(ask.seller == msg.sender || (isMoonbirdEscrowed(_tokenId) && moonbirdTransferredFromOwner[_tokenId] == msg.sender), "setAskPrice must be seller");

        ask.askPrice = _askPrice;

        emit AskPriceUpdated(_tokenId, ask);
    }

    /// @notice Withdraws an Escrowed bird for a seller
    /// @dev note: cancelAsk is preferred for allowing a seller to withdrawing their bird
    function withdrawBird(uint256 _tokenId) external onlyTokenSeller(_tokenId) nonReentrant {
        _withdrawBird(_tokenId);
    }

    /// @notice Fills the ask for a given Moonbird, transferring the ETH/ERC-20 to the seller and Moonbird to the buyer
    /// @param _tokenId The ID of the Moonbird token
    /// @param _fillAmount The amount to fill the ask
    function fillAsk(
        uint256 _tokenId,
        uint256 _fillAmount
    ) external payable nonReentrant {
        Ask storage ask = askForMoonbird[_tokenId];

        require(isMoonbirdEscrowed(_tokenId), "fillAsk The Moonbird associated with this ask must be escrowed within Birdswap before a purchase can be completed");
        require(ask.seller != address(0), "fillAsk must be active ask");
        require(ask.buyer == msg.sender, "must be buyer");
        require(ask.askPrice == _fillAmount, "fillAsk _fillAmount must match ask amount");

        require(msg.value >= ask.askPrice, "_handleIncomingTransfer msg value less than expected amount");

        // Payout marketplace fee
        uint256 remainingProfit = _handleMarketplaceFeePayout(ask.askPrice);

        // Payout respective parties, payout royalties based on configuration
        remainingProfit = _handleRoyaltyPayout(remainingProfit, ask.royaltyFeeBps, 0);

        // Transfer remaining ETH/ERC-20 to seller
        _handleOutgoingTransfer(ask.seller, remainingProfit, 0);

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
        return IERC721ReceiverUpgradeable.onERC721Received.selector;
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

    /// Set the enforce default royalties flag
    function setEnforceDefaultRoyalties(bool _enforceDefaultRoyalties) external onlyOwner {
        enforceDefaultRoyalties = _enforceDefaultRoyalties;
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

        payable(msg.sender).transfer(balance);
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

    function _handleMarketplaceFeePayout(uint256 _amount) private returns (uint256) {
        // Get marketplace fee
        uint256 marketplaceFee = _getFeeAmount(_amount, marketplaceFeeBps);
        // payout marketplace fee
        _handleOutgoingTransfer(marketplaceFeePayoutAddress, marketplaceFee, 50000);

        return _amount - marketplaceFee;
    }

    function _handleRoyaltyPayout(uint256 _amount, uint256 _royaltyFeeBps, uint256 _tokenId) private returns (uint256) {
        // If no fee, return initial amount
        if (_royaltyFeeBps == 0 && !enforceDefaultRoyalties) return _amount;

        // Get Moonbirds royalty payout address
        (address moonbirdsRoyaltyPayoutAddress, uint256 royaltyFee) = moonbirds.royaltyInfo(_tokenId, _amount);

        if (!enforceDefaultRoyalties) {
            // Get custom royalty fee
            royaltyFee = _getFeeAmount(_amount, _royaltyFeeBps);
        }

        // payout royalties
        _handleOutgoingTransfer(moonbirdsRoyaltyPayoutAddress, royaltyFee, 50000);

        return _amount - royaltyFee;
    }

    function _getFeeAmount(uint256 _amount, uint256 feeBps) private pure returns (uint256) {
        return (_amount * feeBps) / 10000;
    }

    function _handleOutgoingTransfer(
        address _dest,
        uint256 _amount,
        uint256 _gasLimit
    ) internal {
        if (_amount == 0 || _dest == address(0)) {
            return;
        }

        require(address(this).balance >= _amount, "_handleOutgoingTransfer insolvent");

        // If no gas limit was provided or provided gas limit greater than gas left, just use the remaining gas.
        uint256 gas = (_gasLimit == 0 || _gasLimit > gasleft()) ? gasleft() : _gasLimit;
        (bool success, ) = _dest.call{value: _amount, gas: gas}("");
        require(success, "transfer failed");
    }

    function _authorizeUpgrade(address) internal view override {
        require(
            _msgSender() == owner(),
            "INVALID_ADMIN"
        );
    }
}
