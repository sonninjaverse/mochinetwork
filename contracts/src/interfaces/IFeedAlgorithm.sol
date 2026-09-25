// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Contract that ranks a candidate set of posts for one viewer.
/// @dev Implementations MUST be view-only and MUST NOT revert for any input.
///      Clients call this through eth_call, so execution costs the caller nothing
///      and a revert shows up to the user as an empty feed.
interface IFeedAlgorithm {
    /// @param viewer The account the feed is being built for.
    /// @param candidateIds Post ids supplied by the client, in arbitrary order.
    /// @return orderedIds candidateIds sorted best-first.
    /// @return scores Score for each entry of orderedIds, same index.
    function rank(address viewer, uint256[] calldata candidateIds)
        external
        view
        returns (uint256[] memory orderedIds, uint256[] memory scores);

    function name() external view returns (string memory);

    function description() external view returns (string memory);
}
