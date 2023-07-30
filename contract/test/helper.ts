import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { Staking, Token } from "../typechain-types";

export async function approveAndFundContract(stakingContract: Staking, tokenContract: Token, amount: number) {
  const tokens = tokensAmount(amount);
  await approveWith(tokenContract, stakingContract.address, amount);
  await stakingContract.fundContractWithErc20Token(tokens)
}

export async function approveAndStake(stakingContract: Staking, tokenContract: Token, amount: number) {
  const tokens = tokensAmount(amount);
  await tokenContract.approve(stakingContract.address, tokens);
  await stakingContract.stake(tokens);
}

export async function approveWith(tokenContract: Token, address: string, amount: number) {
  const tokens = ethers.utils.parseEther(`${amount}`);
  await tokenContract.approve(address, tokens);
}

export async function moveTimeForwardInWeeks(numberOfWeeks = 1) {
  const oneWeekInSeconds = 604800;

  await mine(2, { interval: oneWeekInSeconds * numberOfWeeks });
}

export function tokensAmount(amount: number): BigNumber {
  return ethers.utils.parseEther(`${amount}`)
}