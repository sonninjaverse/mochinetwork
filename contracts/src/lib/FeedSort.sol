// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Sorts a candidate list best-first for feed algorithms.
/// @dev Ranking runs under eth_call, where gas is free, so sorting on chain
///      costs the caller nothing and lets an algorithm apply rules that need
///      the whole ordering rather than per-item scores alone.
library FeedSort {
    /// @param ids Post ids.
    /// @param scores Score per id, same index. Sorted in place alongside ids.
    function byScoreDesc(uint256[] memory ids, uint256[] memory scores)
        internal
        pure
        returns (uint256[] memory, uint256[] memory)
    {
        if (ids.length > 1) {
            _quickSort(ids, scores, int256(0), int256(ids.length - 1));
        }
        return (ids, scores);
    }

    function _quickSort(uint256[] memory ids, uint256[] memory scores, int256 left, int256 right)
        private
        pure
    {
        if (left >= right) return;

        int256 i = left;
        int256 j = right;
        uint256 pivot = scores[uint256(left + (right - left) / 2)];

        while (i <= j) {
            while (scores[uint256(i)] > pivot) ++i;
            while (scores[uint256(j)] < pivot) --j;
            if (i <= j) {
                (scores[uint256(i)], scores[uint256(j)]) = (scores[uint256(j)], scores[uint256(i)]);
                (ids[uint256(i)], ids[uint256(j)]) = (ids[uint256(j)], ids[uint256(i)]);
                ++i;
                --j;
            }
        }

        _quickSort(ids, scores, left, j);
        _quickSort(ids, scores, i, right);
    }
}
