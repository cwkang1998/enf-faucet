// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-contracts/contracts/access/Ownable.sol";

contract Faucet is Ownable {
    // Custom Errors
    error AlreadyClaimed(uint256 unlockTime);
    error InsufficientFunds();
    error TransferFailed();

    // Events
    event FaucetClaimed(address indexed user, uint256 nextUnlockTime);

    // Storage variables
    uint256 constant public allowedPAXGAmount = 100_000_000_000_000_000_000; // 100
    uint256 constant public allowedUSDCAmount = 100_000_000_000_000_000_000_000; // 10_000
    uint256 public waitTime;
    mapping(address => uint256) public userUnlockTime;

    ERC20 public paxgInstance;
    ERC20 public usdcInstance;

    // Constructor
    constructor(address paxgAddress, address usdcAddress, uint256 _waitTime) Ownable(msg.sender) {
        require(paxgAddress != address(0) && usdcAddress != address(0));
        paxgInstance = ERC20(paxgAddress);
        usdcInstance = ERC20(usdcAddress);
        waitTime = _waitTime;
    }

    // External function for claiming ETH
    function claimTestTokens() external {
        address caller = msg.sender;

        // Check if user is allowed to claim
        if (!isAllowedForTransaction(caller)) {
            revert AlreadyClaimed(userUnlockTime[caller]);
        }

        // Ensure faucet has enough ETH
        if (paxgInstance.balanceOf(address(this)) < allowedPAXGAmount || usdcInstance.balanceOf(address(this)) < allowedUSDCAmount) {
            revert InsufficientFunds();
        }

        // Update user's unlock time
        uint256 nextUnlockTime = block.timestamp + waitTime;
        userUnlockTime[caller] = nextUnlockTime;

        // Transfer both test token to the caller
        bool paxgSuccess = paxgInstance.transfer(caller, allowedPAXGAmount);
        bool usdcSuccess = usdcInstance.transfer(caller, allowedUSDCAmount);

        if(!paxgSuccess || !usdcSuccess) {
            revert TransferFailed();
        }

        emit FaucetClaimed(caller, nextUnlockTime);
    }

    // View functions
    function getAllowedTime(address account) external view returns (uint256) {
        return userUnlockTime[account];
    }

    function isAllowedForTransaction(address account) public view returns (bool) {
        uint256 unlockTime = userUnlockTime[account];
        return (block.timestamp >= unlockTime);
    }

    // Owner-only functions
    function setWaitTime(uint256 _waitTime) external onlyOwner {
        waitTime = _waitTime;
    }
}