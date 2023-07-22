import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { Token, Staking } from "../typechain-types";
import { expect } from "chai";
import { BigNumber } from "ethers";

describe("Staking contract", function () {

  async function approveAndFundContract(stakingContract: Staking, tokenContract: Token, amount: number) {
    const tokens = tokensAmount(amount);
    await approveWith(tokenContract, stakingContract.address, amount);
    await stakingContract.fundContractWithErc20Token(tokens)
  }

  async function approveAndStake(stakingContract: Staking, tokenContract: Token, amount: number) {
    const tokens = tokensAmount(amount);
    await tokenContract.approve(stakingContract.address, tokens);
    await stakingContract.stake(tokens);
  }

  async function approveWith(tokenContract: Token, address: string, amount: number) {
    const tokens = ethers.utils.parseEther(`${amount}`);
    await tokenContract.approve(address, tokens);
  }

  async function moveTimeForwardInWeeks(numberOfBlocks = 1) {
    const oneWeekInSeconds = 604800;

    await mine(numberOfBlocks + 1, { interval: oneWeekInSeconds });
  }

  function tokensAmount(amount: number): BigNumber {
    return ethers.utils.parseEther(`${amount}`)
  }

  async function deployErc20Fixture() {
    const tokenFactory = await ethers.getContractFactory("Token");
    const tokenContract = await tokenFactory.deploy(tokensAmount(10));
    await tokenContract.deployed();

    return { tokenContract };
  }

  async function deployFixture() {
    const [deployer] = await ethers.getSigners();
    const deployerAddress = deployer.address
    const { tokenContract } = await loadFixture(deployErc20Fixture);
    const tokenAddress = tokenContract.address;
    const stakingFactory = await ethers.getContractFactory("Staking")
    const stakingContract = await stakingFactory.deploy(tokenAddress);

    return { stakingContract, tokenContract, deployerAddress };
  }

  describe('Fund contract with tokens', () => {
    it("funds with the given amout of tokens", async () => {
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      const fiveTokens = tokensAmount(5);
      const tenTokens = tokensAmount(10);
      await approveAndFundContract(stakingContract, tokenContract, 5);

      expect(await stakingContract.getContractBalance()).to.equal(fiveTokens);
      expect(await tokenContract.balanceOf(stakingContract.address)).to.equal(fiveTokens);
      expect(await tokenContract.balanceOf(deployerAddress)).to.equal(tenTokens.sub(fiveTokens));
    });

    it('reverts if allowance is not enough', async () => {
      const { stakingContract } = await loadFixture(deployFixture);
      const fiveTokens = tokensAmount(5);

      await expect(stakingContract.fundContractWithErc20Token(fiveTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientAllowance");
    });

    it('reverts if balance is not enough', async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      const twentyTokens = tokensAmount(20);

      await tokenContract.approve(stakingContract.address, twentyTokens);

      await expect(stakingContract.fundContractWithErc20Token(twentyTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientBalance");
    });
  });

  describe('Stake  tokens', () => {
    it("allows to stake  tokens", async () => {
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      const tenTokens = tokensAmount(10);
      const fiveTokens = tokensAmount(5);
      const twoTokens = tokensAmount(2);
      await approveAndFundContract(stakingContract, tokenContract, 5)

      await approveAndStake(stakingContract, tokenContract, 2)

      expect(await stakingContract.getContractBalance()).to.equal(fiveTokens.add(twoTokens));
      expect(await tokenContract.balanceOf(deployerAddress)).to.equal(tenTokens.sub(fiveTokens).sub(twoTokens));
      expect(await stakingContract.getStakedAmount(deployerAddress)).to.equal(twoTokens);
    });

    it('reverts if allowance is not enough', async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      await approveAndFundContract(stakingContract, tokenContract, 5);
      const twoTokens = tokensAmount(2);

      await expect(stakingContract.stake(twoTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientAllowance");
    });

    it('reverts if amount is not enough', async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      const twentyTokens = tokensAmount(20);
      const fiveTokens = tokensAmount(5);
      const sevenTokens = tokensAmount(7);
      await tokenContract.approve(stakingContract.address, twentyTokens);
      await stakingContract.fundContractWithErc20Token(fiveTokens)

      await expect(stakingContract.stake(sevenTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientBalance");
    });
  });

  describe('Unstake  tokens', () => {
    it("allows to unstake  tokens", async () => {
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      const twoTokens = tokensAmount(2)
      await approveAndFundContract(stakingContract, tokenContract, 5);
      await approveAndStake(stakingContract, tokenContract, 2)

      await stakingContract.unstake(twoTokens);

      expect(await tokenContract.balanceOf(deployerAddress)).to.equal(tokensAmount(5))
      expect(await stakingContract.getStakedAmount(deployerAddress)).to.equal(tokensAmount(0))
    });

    it("revert if staker has no balance", async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      const twoTokens = tokensAmount(2)
      await approveAndFundContract(stakingContract, tokenContract, 5);

      await expect(stakingContract.unstake(twoTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientStakedBalance");
    })

    it("reverts if tries to unstake more than staked balance", async () => {
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      await approveAndFundContract(stakingContract, tokenContract, 5);
      await approveAndStake(stakingContract, tokenContract, 2)

      await stakingContract.unstake(tokensAmount(1));

      await expect(stakingContract.unstake(tokensAmount(2)))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientStakedBalance");
    })
  })

  describe('Reward system', () => {
    it('calculates the reward per token based on 5% apy', async () => {
      // 5 % APY = 0.05 
      // 1 * (5 / 100) / 1 year in seconds = 0.000000001589845339
      // With 1 token at 5% makes 0.000000001589845339 every second
      const tenTokens = 1;
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      const rewardPerToken = 1589845339
      await approveAndStake(stakingContract, tokenContract, tenTokens);

      expect((await stakingContract.calculateTokenRewardPerSecond())).to.eq(rewardPerToken);
    });

    it('calculates the reward per time staked', async () => {
      const oneToken = 1;
      const weeksPassed = 52;
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      await approveAndStake(stakingContract, tokenContract, oneToken);
      await moveTimeForwardInWeeks(weeksPassed)

      // around 0.05 tokens
      expect(await stakingContract.calculateRewards()).to.gte(tokensAmount(0.05));
      expect(await stakingContract.calculateRewards()).to.lte(tokensAmount(0.051));
    })

    it('allows to claim rewards', async () => {
      const oneToken = 1;
      const weeksPassed = 52;
      const { stakingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
      await approveAndStake(stakingContract, tokenContract, oneToken);
      await moveTimeForwardInWeeks(weeksPassed)

      const initialBalance = await tokenContract.balanceOf(deployerAddress);
      const initialContractBalance = await tokenContract.balanceOf(stakingContract.address);
      await stakingContract.claimReward();
      const finalBalance = await tokenContract.balanceOf(deployerAddress);
      const finalContractBalance = await tokenContract.balanceOf(stakingContract.address);

      expect(finalBalance).to.gt(initialBalance);
      expect(finalContractBalance).to.lt(initialContractBalance);
    });

    it('reverts if clamied amount exceeds contract balance', async () => {
      const oneToken = 1;
      const weeksPassed = 1040; // 20 years
      const { stakingContract, tokenContract } = await loadFixture(deployFixture);
      await approveAndStake(stakingContract, tokenContract, oneToken);
      await moveTimeForwardInWeeks(weeksPassed)

      await expect(stakingContract.claimReward())
        .revertedWithCustomError(stakingContract, "Staking__InsufficientContractBalance");
    });
  });
});
