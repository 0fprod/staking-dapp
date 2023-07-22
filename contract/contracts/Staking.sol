// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {console} from "hardhat/console.sol";

error Staking__InsufficientAllowance();
error Staking__InsufficientBalance();
error Staking__InsufficientStakedBalance();

contract Staking {
    struct Staker {
        uint256 stakedAmount;
        uint256 stakedAt;
    }

    uint constant APY = 5; // 5 %
    IERC20 public Gall;

    mapping(address => Staker) public stakers;

    constructor(address _gall) {
        Gall = IERC20(_gall);
    }

    modifier notEnoughAllowance(uint256 _amount) {
        if (Gall.allowance(msg.sender, address(this)) < _amount) {
            revert Staking__InsufficientAllowance();
        }
        _;
    }

    modifier notEnoughBalance(uint256 _amount) {
        if (_amount > Gall.balanceOf(msg.sender)) {
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

    function fundContractWithGall(
        uint256 _amount
    ) public notEnoughAllowance(_amount) notEnoughBalance(_amount) {
        Gall.transferFrom(msg.sender, address(this), _amount);
    }

    function getContractGalBalance() public view returns (uint256) {
        return Gall.balanceOf(address(this));
    }

    function stake(
        uint256 _amount
    ) public notEnoughAllowance(_amount) notEnoughBalance(_amount) {
        if (stakers[msg.sender].stakedAmount == 0) {
            stakers[msg.sender].stakedAt = block.timestamp;
        }
        Gall.transferFrom(msg.sender, address(this), _amount);
        stakers[msg.sender].stakedAmount += _amount;
    }

    function unstake(uint256 _amount) public notEnoughStakedBalance(_amount) {
        Gall.approve(address(this), _amount);
        Gall.transferFrom(address(this), msg.sender, _amount);
        stakers[msg.sender].stakedAmount -= _amount;
    }

    function getStakedAmount(address _address) public view returns (uint256) {
        return stakers[_address].stakedAmount;
    }

    function calculateRewards() public view returns (uint) {
        uint rewardPerToken = calculateRewardPerToken();
        uint timeStaked = block.timestamp - stakers[msg.sender].stakedAt;
        uint rewards = timeStaked * rewardPerToken;

        return rewards;
    }

    function calculateRewardPerToken() public view returns (uint) {
        // 5 % of total staked
        uint totalStaked = stakers[msg.sender].stakedAmount;
        uint appliedApy = (totalStaked * APY) / 100;
        uint rewardPerToken = appliedApy / 52 weeks;
        return rewardPerToken;
    }
}
