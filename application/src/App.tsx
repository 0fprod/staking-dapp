import { ConnectWallet, useChain } from '@thirdweb-dev/react';
import './styles/Home.css';

export default function Home() {
  const chain = useChain();

  return (
    <main className="main">
      <div className="container">
        <div className="header">
          <h1 className="title">
            Welcome to <span className="gradient-text-0">Staking Dapp.</span>
          </h1>
          <div className="grid">
            <div className="connect">
              <ConnectWallet
                dropdownPosition={{
                  side: 'bottom',
                  align: 'center',
                }}
              />
            </div>
            <p> Connected to: "{chain?.chain}"</p>
          </div>
        </div>

        <div className="grid">things here</div>
      </div>
    </main>
  );
}
