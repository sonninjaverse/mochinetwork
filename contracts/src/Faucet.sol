// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice A one-claim faucet for Mochi on Monad testnet.
///
/// @dev Eligibility is deliberately the narrowest rule that can be enforced on
///      chain: a wallet that has never claimed from this faucet can claim once.
///      That is what "new" has to mean to a contract that cannot see whether an
///      address belongs to a person, and it is the definition the product
///      agrees to before launch — a wallet is new *to the faucet*.
///
///      The claim amount is fixed and small (3 tMON), which is enough for
///      signing a handle and posting, and the contract holds only what someone
///      funded it with. There is no admin: anyone can top it up by sending MON,
///      and when the float runs out the claim reverts rather than the contract
///      inventing funds.
contract Faucet {
    error AlreadyClaimed();
    error Empty();
    error TransferFailed();

    /// @dev One claim: enough for gas to register a name and post, with room
    ///      for a few failed attempts.
    uint256 public constant CLAIM_AMOUNT = 3 ether;

    /// @notice Which wallets have already taken their one claim.
    mapping(address => bool) public claimed;

    event Claimed(address indexed account, uint256 amount);
    event Funded(address indexed from, uint256 amount);

    /// @notice Takes this wallet's single claim.
    /// @dev State is written before the transfer, so a re-entrant claim finds
    ///      itself already marked and reverts. The whole claim reverts if the
    ///      transfer cannot be made, which keeps the flag and the funds in
    ///      agreement.
    function claim() external {
        if (claimed[msg.sender]) revert AlreadyClaimed();
        if (address(this).balance < CLAIM_AMOUNT) revert Empty();

        claimed[msg.sender] = true;
        emit Claimed(msg.sender, CLAIM_AMOUNT);

        (bool ok,) = msg.sender.call{value: CLAIM_AMOUNT}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Funds the faucet. Open to anyone, because a testnet float
    ///         should be a thing the community can refill.
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }
}
