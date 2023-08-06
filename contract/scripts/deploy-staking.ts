import { ethers } from "hardhat";

async function main() {
  const tokenAddrss = "0xcbd3161f5C8e39b5d0F800Dd991834F518B1c0fD";

  const stakingContract = await ethers.deployContract("Staking", [tokenAddrss]);
  await stakingContract.deployed();
  console.log('Staking deployed to:', stakingContract.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});