import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { Gal, Staking } from "../typechain-types";
import { expect } from "chai";
import { BigNumber } from "ethers";

describe("Staking contract", function () {

  async function printContractsInfo(stakingContract: Staking, gallContract: Gal, deployer: string) {
    console.log('Deployer address:', deployer);
    console.log('Staking contract address:', stakingContract.address);
    console.log('Gall token address:', gallContract.address);
    console.log("Gall decimal", await gallContract.decimals());
    const totalSupply = await gallContract.totalSupply();
    console.log('Gall total supply:', ethers.utils.formatEther(totalSupply));
    console.log('Deployer initial balance:', ethers.utils.formatEther(await gallContract.balanceOf(deployer)));
  }

  async function approveAndFundContract(stakingContract: Staking, gallContract: Gal, amount: number) {
    const tokens = tokensAmount(amount);
    await approveWith(gallContract, stakingContract.address, amount);
    await stakingContract.fundContractWithGall(tokens)
  }

  async function approveAndStake(stakingContract: Staking, gallContract: Gal, amount: number) {
    const tokens = tokensAmount(amount);
    await gallContract.approve(stakingContract.address, tokens);
    await stakingContract.stake(tokens);
  }

  async function approveWith(gallContract: Gal, address: string, amount: number) {
    const tokens = ethers.utils.parseEther(`${amount}`);
    await gallContract.approve(address, tokens);
  }

  async function moveTimeForwardInWeeks(numberOfBlocks = 1) {
    const oneWeekInSeconds = 604800;

    await mine(numberOfBlocks + 1, { interval: oneWeekInSeconds });
  }

  function tokensAmount(amount: number): BigNumber {
    return ethers.utils.parseEther(`${amount}`)
  }

  async function deployErc20Fixture() {
    const TenGallTokens = tokensAmount(10);
    const gallTokenFactory = await ethers.getContractFactory("Gal");
    const gallContract = await gallTokenFactory.deploy(TenGallTokens);
    await gallContract.deployed();

    return { gallContract };
  }

  async function deployFixture() {
    const [deployer] = await ethers.getSigners();
    const deployerAddress = deployer.address
    const { gallContract } = await loadFixture(deployErc20Fixture);
    const gallTokenAddress = gallContract.address;
    const stakingFactory = await ethers.getContractFactory("Staking")
    const stakingContract = await stakingFactory.deploy(gallTokenAddress);
    await printContractsInfo(stakingContract, gallContract, deployerAddress);

    return { stakingContract, gallContract, deployerAddress };
  }

  describe('Fund contract with GAL tokens', () => {
    it("funds with the given amout of tokens", async () => {
      const { stakingContract, gallContract, deployerAddress } = await loadFixture(deployFixture);
      const fiveTokens = tokensAmount(5);
      const tenTokens = tokensAmount(10);
      await approveAndFundContract(stakingContract, gallContract, 5);

      expect(await stakingContract.getContractGalBalance()).to.equal(fiveTokens);
      expect(await gallContract.balanceOf(stakingContract.address)).to.equal(fiveTokens);
      expect(await gallContract.balanceOf(deployerAddress)).to.equal(tenTokens.sub(fiveTokens));
    });

    it('reverts if allowance is not enough', async () => {
      const { stakingContract } = await loadFixture(deployFixture);
      const fiveTokens = tokensAmount(5);

      await expect(stakingContract.fundContractWithGall(fiveTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientAllowance");
    });

    it('reverts if balance is not enough', async () => {
      const { stakingContract, gallContract } = await loadFixture(deployFixture);
      const twentyTokens = tokensAmount(20);

      await gallContract.approve(stakingContract.address, twentyTokens);

      await expect(stakingContract.fundContractWithGall(twentyTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientBalance");
    });
  });

  describe('Stake GAL tokens', () => {
    it("allows to stake GAL tokens", async () => {
      const { stakingContract, gallContract, deployerAddress } = await loadFixture(deployFixture);
      const tenTokens = tokensAmount(10);
      const fiveTokens = tokensAmount(5);
      const twoTokens = tokensAmount(2);
      await approveAndFundContract(stakingContract, gallContract, 5)

      await approveAndStake(stakingContract, gallContract, 2)

      expect(await stakingContract.getContractGalBalance()).to.equal(fiveTokens.add(twoTokens));
      expect(await gallContract.balanceOf(deployerAddress)).to.equal(tenTokens.sub(fiveTokens).sub(twoTokens));
      expect(await stakingContract.getStakedAmount(deployerAddress)).to.equal(twoTokens);
    });

    it('reverts if allowance is not enough', async () => {
      const { stakingContract, gallContract } = await loadFixture(deployFixture);
      await approveAndFundContract(stakingContract, gallContract, 5);
      const twoTokens = tokensAmount(2);

      await expect(stakingContract.stake(twoTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientAllowance");
    });

    it('reverts if amount is not enough', async () => {
      const { stakingContract, gallContract } = await loadFixture(deployFixture);
      const twentyTokens = tokensAmount(20);
      const fiveTokens = tokensAmount(5);
      const sevenTokens = tokensAmount(7);
      await gallContract.approve(stakingContract.address, twentyTokens);
      await stakingContract.fundContractWithGall(fiveTokens)

      await expect(stakingContract.stake(sevenTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientBalance");
    });
  });


  describe('Unstake GAL tokens', () => {
    it("allows to unstake GAL tokens", async () => {
      const { stakingContract, gallContract, deployerAddress } = await loadFixture(deployFixture);
      const twoTokens = tokensAmount(2)
      await approveAndFundContract(stakingContract, gallContract, 5);
      await approveAndStake(stakingContract, gallContract, 2)

      await stakingContract.unstake(twoTokens);

      expect(await gallContract.balanceOf(deployerAddress)).to.equal(tokensAmount(5))
      expect(await stakingContract.getStakedAmount(deployerAddress)).to.equal(tokensAmount(0))
    });

    it("revert if staker has no balance", async () => {
      const { stakingContract, gallContract } = await loadFixture(deployFixture);
      const twoTokens = tokensAmount(2)
      await approveAndFundContract(stakingContract, gallContract, 5);

      await expect(stakingContract.unstake(twoTokens))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientStakedBalance");
    })

    it("reverts if tries to unstake more than staked balance", async () => {
      const { stakingContract, gallContract } = await loadFixture(deployFixture);
      await approveAndFundContract(stakingContract, gallContract, 5);
      await approveAndStake(stakingContract, gallContract, 2)

      await stakingContract.unstake(tokensAmount(1));

      await expect(stakingContract.unstake(tokensAmount(2)))
        .revertedWithCustomError(stakingContract, "Staking__InsufficientStakedBalance");
    })
  })

  describe('Reward system', () => {

    it('Calculates the number of weeks since first stake', async () => {
      const weeksPassed = 2
      const { stakingContract, gallContract } = await loadFixture(deployFixture);
      await approveAndStake(stakingContract, gallContract, 5);
      await moveTimeForwardInWeeks(weeksPassed)

      expect(await stakingContract.calculateNumberOfPayouts()).to.equal(2);
    })

  async function approveAndFundContract(stakingContract: Staking, gallContract: Gal, amount: number) {
    const tokens = tokensAmount(amount);
    await approveWith(gallContract, stakingContract.address, amount);
    await stakingContract.fundContractWithGall(tokens)
  }

  async function approveAndStake(stakingContract: Staking, gallContract: Gal, amount: number) {
    const tokens = tokensAmount(amount);
    await gallContract.approve(stakingContract.address, tokens);
    await stakingContract.stake(tokens);
  }

  });

  function tokensAmount(amount: number): BigNumber {
    return ethers.utils.parseEther(`${amount}`)
  }
});
