// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {console} from "hardhat/console.sol";

error Staking__InsufficientAllowance();
error Staking__InsufficientBalance();
error Staking__InsufficientStakedBalance();
error Staking__InsufficientContractBalance();

contract Staking {
    struct Staker {
        uint256 stakedAmount;
        uint256 stakedAt;
    }

    struct Reward {
        uint256 amount;
        uint256 lastClaimed;
    }

    uint constant APY = 5; // 5 %
    IERC20 public Token;

    mapping(address => Staker) public stakers;
    mapping(address => Reward) public rewards;

    constructor(address _token) {
        Token = IERC20(_token);
    }

    modifier notEnoughAllowance(uint256 _amount) {
        if (Token.allowance(msg.sender, address(this)) < _amount) {
            revert Staking__InsufficientAllowance();
        }
        _;
    }

    modifier notEnoughBalance(uint256 _amount) {
        if (_amount > Token.balanceOf(msg.sender)) {
            revert Staking__InsufficientBalance();
        }
        _;
    }

    modifier notEnoughStakedBalance(uint256 _amount) {
        if (
            stakers[msg.sender].stakedAmount <= 0 ||
            stakers[msg.sender].stakedAmount < _amount
        ) {
            revert Staking__InsufficientStakedBalance();
        }
        _;
    }

    function fundContractWithErc20Token(
        uint256 _amount
    ) public notEnoughAllowance(_amount) notEnoughBalance(_amount) {
        Token.transferFrom(msg.sender, address(this), _amount);
    }

    function getContractBalance() public view returns (uint256) {
        return Token.balanceOf(address(this));
    }

    function stake(
        uint256 _amount
    ) public notEnoughAllowance(_amount) notEnoughBalance(_amount) {
        if (stakers[msg.sender].stakedAmount == 0) {
            stakers[msg.sender].stakedAt = block.timestamp;
        }
        Token.transferFrom(msg.sender, address(this), _amount);
        stakers[msg.sender].stakedAmount += _amount;
    }

    function unstake(uint256 _amount) public notEnoughStakedBalance(_amount) {
        Token.approve(address(this), _amount);
        Token.transferFrom(address(this), msg.sender, _amount);
        stakers[msg.sender].stakedAmount -= _amount;
    }

    function getStakedAmount(address _address) public view returns (uint256) {
        return stakers[_address].stakedAmount;
    }

    function calculateRewards() public view returns (uint) {
        uint tokenRewardsPerSecond = calculateTokenRewardPerSecond();

        uint secondsStaked = block.timestamp - stakers[msg.sender].stakedAt;
        uint rewardAmount = secondsStaked * tokenRewardsPerSecond;
        return rewardAmount;
    }

    function calculateTokenRewardPerSecond() public view returns (uint) {
        // 5 % of total staked
        uint totalStaked = stakers[msg.sender].stakedAmount;
        uint appliedApy = (totalStaked * APY) / 100;
        uint rewardsPerSecond = appliedApy / 52 weeks;
        return rewardsPerSecond;
    }

    function claimReward() public {
        uint rewardAmount = calculateRewards();

        if (rewardAmount > Token.balanceOf(address(this))) {
            revert Staking__InsufficientContractBalance();
        }

        Token.approve(address(this), rewardAmount);
        Token.transferFrom(address(this), msg.sender, rewardAmount);
        rewards[msg.sender].amount += rewardAmount;
        rewards[msg.sender].lastClaimed = block.timestamp;
    }
}
