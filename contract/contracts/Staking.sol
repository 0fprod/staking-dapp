// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import {console} from "hardhat/console.sol";

error Staking__InsufficientStakedBalance();
error Staking__InsufficientContractBalance();
error Staking__InsufficientTimePassed();

contract Staking {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct Staker {
        uint256 stakedAmount;
        uint256 lastUpdated;
    }

    IERC20 public immutable Token;
    uint constant APY = 5;
    uint public totalStaked = 0;
    mapping(address => Staker) public stakers;

    constructor(address _token) {
        Token = IERC20(_token);
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

    function fundContractWithErc20Token(uint256 _amount) public {
        Token.transferFrom(msg.sender, address(this), _amount);
    }

    function getAvailableRewards() public view returns (uint256) {
        return Token.balanceOf(address(this)).sub(totalStaked);
    }

    function getStakedAmount() public view returns (uint256) {
        return totalStaked;
    }

    function stake(uint256 _amount) public {
        if (stakers[msg.sender].stakedAmount == 0) {
            stakers[msg.sender].lastUpdated = block.timestamp;
        }
        Token.transferFrom(msg.sender, address(this), _amount);
        stakers[msg.sender].stakedAmount = stakers[msg.sender].stakedAmount.add(
            _amount
        );
        totalStaked = totalStaked.add(_amount);
    }

    function unstake(uint256 _amount) public notEnoughStakedBalance(_amount) {
        Token.approve(address(this), _amount);
        Token.transferFrom(address(this), msg.sender, _amount);
        stakers[msg.sender].stakedAmount = stakers[msg.sender].stakedAmount.sub(
            _amount
        );
        totalStaked = totalStaked.sub(_amount);
    }

    function getStakedAmountFor(
        address _address
    ) public view returns (uint256) {
        return stakers[_address].stakedAmount;
    }

    function calculateTokenRewardPerSecond() public view returns (uint) {
        uint stakedBalance = stakers[msg.sender].stakedAmount;
        uint appliedApy = stakedBalance.mul(APY).div(100);
        uint rewardsPerSecond = appliedApy.div(52 weeks);
        return rewardsPerSecond;
    }

    function compoundRewards() public {
        uint timePassed = block.timestamp - stakers[msg.sender].lastUpdated;
        if (timePassed < 1 weeks) {
            revert Staking__InsufficientTimePassed();
        }

        uint rewards = calculateTokenRewardPerSecond();
        if (getAvailableRewards() < rewards) {
            revert Staking__InsufficientContractBalance();
        }

        uint rewardAmount = timePassed.mul(rewards);
        stakers[msg.sender].stakedAmount = stakers[msg.sender].stakedAmount.add(
            rewardAmount
        );
        stakers[msg.sender].lastUpdated = block.timestamp;
        totalStaked = totalStaked.add(rewardAmount);
    }
}
