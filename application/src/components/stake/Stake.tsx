import { Web3Button, useContract } from '@thirdweb-dev/react';
import { stakingContractABI, stakingContractAddress, erc20TokenAddress } from '../../../constants';
import { useState } from 'react';
import { BigNumber, BigNumberish, ethers } from 'ethers';

interface Props {
  refreshBalance: () => void;
}

export default function Stake({ refreshBalance }: Props) {
  const [amount, setAmount] = useState<BigNumberish>(BigNumber.from(0));
  const { contract: tokenContract } = useContract(erc20TokenAddress, 'token');

  return (
    <section className="section">
      <h1>Stake section</h1>
      <label htmlFor="stake-amount">Stake</label>
      <input
        id="stake-amount"
        type="number"
        placeholder="Amount"
        onChange={(event) => {
          const amount = event.target.value;
          const amountInWei = ethers.utils.parseEther(amount);
          setAmount(amountInWei);
        }}
      />
      <Web3Button
        contractAddress={stakingContractAddress}
        contractAbi={stakingContractABI}
        action={async (contract) => {
          tokenContract?.call('approve', [stakingContractAddress, amount]).then(() => {
            contract.call('stake', [amount]).then(() => {
              refreshBalance();
            });
          });
        }}
        onSuccess={(result) => {
          console.log(result);
        }}
        onError={(error) => {
          console.log(error);
        }}
        isDisabled={!amount}
      >
        Approve & Stake
      </Web3Button>
    </section>
  );
}
