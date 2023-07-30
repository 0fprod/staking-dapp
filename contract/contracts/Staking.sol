// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "abdk-libraries-solidity/ABDKMathQuad.sol";
// import {console} from "hardhat/console.sol";

error Staking__InsufficientStakedBalance();
error Staking__InsufficientContractBalance();

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

    function unstake(uint256 _amountToUnstake) public {
        Staker memory staker = stakers[msg.sender];
        uint rewardAmount = calculateCompoundedRewards();
        uint virtualTotalStaked = totalStaked.add(rewardAmount);
        staker.stakedAmount = staker.stakedAmount.add(rewardAmount);
        uint availableRewards = getAvailableRewards();

        if (staker.stakedAmount < _amountToUnstake) {
            revert Staking__InsufficientStakedBalance();
        }

        // TODO: Review edge cases
        // if (
        //     _amountToUnstake <= stakers[msg.sender].stakedAmount &&
        //     availableRewards < rewardAmount
        // ) {
        //     Token.transfer(msg.sender, _amountToUnstake);
        //     stakers[msg.sender].stakedAmount = stakers[msg.sender]
        //         .stakedAmount
        //         .sub(_amountToUnstake);
        //     stakers[msg.sender].lastUpdated = block.timestamp;
        //     totalStaked = totalStaked.sub(_amountToUnstake);
        //     return;
        // }

        if (availableRewards < rewardAmount) {
            revert Staking__InsufficientContractBalance();
        }

        Token.transfer(msg.sender, _amountToUnstake);
        stakers[msg.sender].stakedAmount = staker.stakedAmount.sub(
            _amountToUnstake
        );
        stakers[msg.sender].lastUpdated = block.timestamp;
        totalStaked = virtualTotalStaked.sub(_amountToUnstake);
    }

    function getStakedAmountFor(
        address _address
    ) public view returns (uint256) {
        return stakers[_address].stakedAmount;
    }

    function calculatePercentageOf(
        uint amount,
        uint percentage
    ) public pure returns (uint) {
        return
            ABDKMathQuad.toUInt(
                ABDKMathQuad.div(
                    ABDKMathQuad.mul(
                        ABDKMathQuad.fromUInt(amount),
                        ABDKMathQuad.fromUInt(percentage)
                    ),
                    ABDKMathQuad.fromUInt(100)
                )
            );
    }

    function calculateCompoundedRewards() public view returns (uint256) {
        Staker memory staker = stakers[msg.sender];
        uint timeDifference = block.timestamp - staker.lastUpdated;
        uint numberOfWeeks = timeDifference / 1 weeks;
        uint balance = staker.stakedAmount;

        for (uint i = 0; i < numberOfWeeks; i++) {
            uint compoundedInterest = calculatePercentageOf(balance, APY).div(
                52
            );
            balance = balance.add(compoundedInterest);
        }

        return balance.sub(staker.stakedAmount);
    }
}
