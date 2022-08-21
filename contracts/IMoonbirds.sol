pragma solidity ^0.8.10;

import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "erc721a/contracts/IERC721A.sol";

/**
@dev A minimal interface for interaction with the Moonbirds contract.
 */
interface IMoonbirds is IERC721A, IERC2981 {
    function safeTransferWhileNesting(
        address from,
        address to,
        uint256 tokenId
    );
}
