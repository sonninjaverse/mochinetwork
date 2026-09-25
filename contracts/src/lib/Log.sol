// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Fixed-point logarithms, 1e18 scale.
/// @dev Needed because Reddit's hot ranking adds a logarithm to a linear time
///      term, so ordering alone is not enough — the actual value matters.
library Log {
    uint256 internal constant ONE = 1e18;

    /// log10(2) in 1e18 fixed point.
    uint256 internal constant LOG10_2 = 301029995663981195;

    /**
     * @notice log2 of a 1e18 fixed-point number, as 1e18 fixed point.
     * @dev Integer part from the position of the highest set bit, fractional
     *      part by repeated squaring — the standard approach, and exact enough
     *      that ranking never disagrees with a float implementation.
     *      Returns 0 for inputs at or below 1.0, which is where the callers
     *      clamp anyway.
     */
    function log2(uint256 x) internal pure returns (uint256 result) {
        if (x <= ONE) return 0;

        uint256 n = x / ONE;
        uint256 integerPart;
        while (n > 1) {
            n >>= 1;
            integerPart++;
        }

        result = integerPart * ONE;
        uint256 y = x >> integerPart;
        if (y == ONE) return result;

        // 60 iterations is far more precision than a ranking needs; the loop
        // exits as soon as the remainder is exhausted.
        for (uint256 delta = ONE / 2; delta > 0; delta >>= 1) {
            y = (y * y) / ONE;
            if (y >= 2 * ONE) {
                result += delta;
                y >>= 1;
            }
        }
    }

    /// @notice log10 of a 1e18 fixed-point number, as 1e18 fixed point.
    function log10(uint256 x) internal pure returns (uint256) {
        return (log2(x) * LOG10_2) / ONE;
    }

    /// @notice log10 of a plain integer, as 1e18 fixed point. log10(0) is 0.
    function log10Int(uint256 n) internal pure returns (uint256) {
        if (n <= 1) return 0;
        return log10(n * ONE);
    }

    /// @notice Square root of a 1e18 fixed-point number, as 1e18 fixed point.
    /// @dev Babylonian method. Wilson's interval needs one, and Solidity has
    ///      no native sqrt for fixed point.
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;

        // Scale up before the integer sqrt so the result lands back at 1e18.
        uint256 n = x * ONE;

        uint256 z = (n + 1) / 2;
        uint256 y = n;
        while (z < y) {
            y = z;
            z = (n / z + z) / 2;
        }
        return y;
    }
}
