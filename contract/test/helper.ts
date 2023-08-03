import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { Staking, Token } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export async function approveAndFundContract(stakingContract: Staking, tokenContract: Token, amount: number) {
  const tokens = tokensAmount(amount);
  await approveWith(tokenContract, stakingContract.address, amount);
  await stakingContract.fundContractWithErc20Token(tokens)
}

export async function approveAndStake(stakingContract: Staking, tokenContract: Token, amount: number, signer?: SignerWithAddress) {
  const tokens = tokensAmount(amount);
  if (signer) {
    await tokenContract.connect(signer).approve(stakingContract.address, tokens);
    await stakingContract.connect(signer).stake(tokens);
    return;
  }
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

export function formatUnits(amount: BigNumber): number {
  return +ethers.utils.formatUnits(amount, 18)
}

export function mintTokensFor(tokenContract: Token, signer: SignerWithAddress, amount: number) {
  return tokenContract.connect(signer).faucet(signer.address, tokensAmount(amount))
}