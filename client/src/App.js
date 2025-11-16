import { useState, useEffect } from 'react';
import {
  Contract,
  MockNetworkProvider,
  randomUtxo,
} from 'cashscript';
import {
    binToHex,
    decodeCashAddress,
} from '@bitauth/libauth';

import perpetual from './perpetual_tokens.json' with { type: 'json' };

import './App.css';


function App() {
  const [contract, setContract] = useState(null);
  const [contractUtxos, setContractUtxos] = useState(null);
  const onSubmit = e => {
    e.preventDefault();
    const address = e.target.address.value;
    const pubKey = decodeCashAddress(address);
    console.log('verify', address, pubKey);
    const pubKeyHex = binToHex(pubKey.payload);

    // TODO: Change the network
    const provider = new MockNetworkProvider();
    const contract = new Contract(perpetual, [pubKeyHex], { provider });

    setContract(contract);
  };
  useEffect(() => {
    let disposed = false;
    const fetch = async () => {
      if(contract) {
        const provider = new MockNetworkProvider();
        provider.addUtxo(contract.tokenAddress, randomUtxo())
        const utxos = await provider.getUtxos(contract.tokenAddress);
        if(!disposed) {
          setContractUtxos(utxos);
        }
      }
    }

    fetch();
    return () => {
      disposed = true;
    }
  }, [contract?.tokenAddress]);
  return (
    <div className="app">
      <header className="app-header">
        <h1>
          PerpetualThis
        </h1>
      </header>

      <main className="app-main">
        <div className="app-content">
          {
            !contract && (
              <form onSubmit={onSubmit}>
                <div>
                  Enter BCH Address:
                </div>
                <div>
                  <input id="address" type="text" />
                </div>
                <div>
                  <input type="submit" value="onSubmit" />
                </div>
              </form>
            )
          }
          {
            contract && (!contractUtxos || contractUtxos.length == 0) && (
              <div>
                Send Tokens Here:<br /> { contract.tokenAddress }
              </div>
            )
          }
        </div>
      </main>

      <footer className="app-footer">
        <div>
          BCHBlaze 2025
        </div>
      </footer>
    </div>
  );
}

export default App;
