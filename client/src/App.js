import { useState, useEffect, useCallback } from 'react';
import {
  Contract,
  MockNetworkProvider,
  randomUtxo,
  randomToken,
  SignatureTemplate,
  TransactionBuilder,
  ElectrumNetworkProvider,
} from 'cashscript';
import {
  instantiateSecp256k1,
  instantiateRipemd160,
  instantiateSha256,
  generatePrivateKey,
  binToHex,
  decodeCashAddress,
  encodeCashAddress,
  decodePrivateKeyWif,
} from '@bitauth/libauth';

import perpetuity from './perpetuity_tokens.json' with { type: 'json' };
import executorWallet from './executorWallet.json' with { type: 'json' };

import './App.css';

const bigIntMax = (...args) => args.reduce((m, e) => e > m ? e : m);

const secp256k1 = await instantiateSecp256k1();
const ripemd160 = await instantiateRipemd160();
const sha256 = await instantiateSha256();

const generateWallet = (network) => {
  const privateKey = generatePrivateKey();
  const pubKeyBin = secp256k1.derivePublicKeyCompressed(privateKey);
  const pubKeyHex = binToHex(pubKeyBin);
  const signatureTemplate = new SignatureTemplate(privateKey);
  const pubKeyHash = ripemd160.hash(sha256.hash(pubKeyBin));
  const encoded = encodeCashAddress({ prefix: network === 'mainnet' ? 'bitcoincash' : 'bchtest', type: 'p2pkhWithTokens', payload: pubKeyHash });
  return { privateKey, pubKeyHex, pubKeyHash, signatureTemplate, address: typeof encoded === 'string' ? encoded : encoded.address };
};

function getWallet({ network, wallet }) {
  const privateKey = wallet.PrivateKey;
  const signatureTemplate = new SignatureTemplate(privateKey);

  const decodedWif = decodePrivateKeyWif(wallet.PrivateKey);
  const pubKeyBin = secp256k1.derivePublicKeyCompressed(decodedWif.privateKey);
  const pubKeyHex = binToHex(pubKeyBin);
  const pubKeyHash = ripemd160.hash(sha256.hash(pubKeyBin));
  const encoded = encodeCashAddress({ prefix: network === 'mainnet' ? 'bitcoincash' : 'bchtest', type: 'p2pkhWithTokens', payload: pubKeyHash });
  return { privateKey, signatureTemplate, pubKeyBin, pubKeyHex, pubKeyHash, address: typeof encoded === 'string' ? encoded : encoded.address };
}

function App() {
  const [user, setUser] = useState(null);
  const [contract, setContract] = useState(null);
  const [contractUtxos, setContractUtxos] = useState(null);
  const [network, setNetwork] = useState('mocknet');
  const [provider, setProvider] = useState(new MockNetworkProvider());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const onSubmit = useCallback(e => {
    e.preventDefault();
    const address = e.target.address.value;

    if (!address) {
      setFormError('No address provided');
      return;
    };

    let pubKeyHex;
    try {
      const pubKey = decodeCashAddress(address);
      pubKeyHex = binToHex(pubKey.payload);
    } catch (error) {
      setFormError('Error parsing address');
      console.error('Error parsing address', error)
      return;
    }

    const contract = new Contract(perpetuity, [pubKeyHex], { provider });

    setUser({ address });
    setContract(contract);
  }, [provider]);
  const onRefresh = async () => {
    const updated = await provider.getUtxos(contract.tokenAddress);
    setContractUtxos(updated);
  };
  const onMock = async () => {
    provider.addUtxo(contract.tokenAddress, randomUtxo({
      token: randomToken(),
    }));
    const updated = await provider.getUtxos(contract.tokenAddress);
    setContractUtxos(updated);
  };
  const onMockExecute = useCallback(async _ => {
    setSubmitting(true);
    const executor = generateWallet(network);
    const feesUtxo = randomUtxo();
    provider.addUtxo(executor.address, feesUtxo);

    const perpetuityUtxo = contractUtxos[0];
    const service = executor;

    const initial = perpetuityUtxo.token.amount;
    const payout = bigIntMax(1n, (initial / 100n) * 2n);
    const fee = bigIntMax(1n, initial / 1000n);
    const remainder = initial - payout - fee;
    if (remainder > 0) {
      await new TransactionBuilder({ provider })
        .addInput(perpetuityUtxo, contract.unlock.release())
        .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
        .addOutput({ to: user.address, amount: 1000n, token: { amount: payout, category: perpetuityUtxo.token.category } })
        .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: remainder, category: perpetuityUtxo.token.category } })
        .addOutput({ to: service.address, amount: 1000n, token: { amount: fee, category: perpetuityUtxo.token.category } })
        .send();
    } else {
      if (initial - payout > 0) {
        // potentially a partial fee payout
        await new TransactionBuilder({ provider })
          .addInput(perpetuityUtxo, contract.unlock.release())
          .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
          .addOutput({ to: user.address, amount: 1000n, token: { amount: payout, category: perpetuityUtxo.token.category } })
          .addOutput({ to: service.address, amount: 1000n, token: { amount: initial - payout, category: perpetuityUtxo.token.category } })
          .send();
      } else {
        // lose out on cost to execute? or rework this to do a balloon payment?
        await new TransactionBuilder({ provider })
          .addInput(perpetuityUtxo, contract.unlock.release())
          .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
          .addOutput({ to: user.address, amount: 1000n, token: { amount: payout, category: perpetuityUtxo.token.category } })
          .addOutput({ to: service.address, amount: 1000n })
          .send();
      }
    }

    const updated = await provider.getUtxos(contract.tokenAddress);
    setContractUtxos(updated);
    setSubmitting(false);
  }, [network, contractUtxos, contract, provider, user]);
  const onExecute = useCallback(async _ => {
    setSubmitting(true);

    const perpetuityUtxo = contractUtxos[0];
    const executor = getWallet({ network, wallet: executorWallet });
    const executorUtxos = (await provider.getUtxos(executor.address)).filter(u => !u.token && u.satoshis > 5000);
    debugger;
    
    if(executorUtxos.length === 0) {
      console.error('no usable UTXOs available');
      return;
    }
    
    const feesUtxo = executorUtxos[0];

    const initial = perpetuityUtxo.token.amount;
    const payout = bigIntMax(1n, (initial / 100n) * 2n);
    const fee = bigIntMax(1n, initial / 1000n);
    const remainder = initial - payout - fee;
    if (remainder > 0) {
      await new TransactionBuilder({ provider })
        .addInput(perpetuityUtxo, contract.unlock.release())
        .addInput(feesUtxo, executor.signatureTemplate.unlockP2PKH())
        .addOutput({ to: user.address, amount: 1000n, token: { amount: payout, category: perpetuityUtxo.token.category } })
        .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: remainder, category: perpetuityUtxo.token.category } })
        .addOutput({ to: executor.address, amount: 1000n, token: { amount: fee, category: perpetuityUtxo.token.category } })
        .send();
    } else {
      if (initial - payout > 0) {
        // potentially a partial fee payout
        await new TransactionBuilder({ provider })
          .addInput(perpetuityUtxo, contract.unlock.release())
          .addInput(feesUtxo, executor.signatureTemplate.unlockP2PKH())
          .addOutput({ to: user.address, amount: 1000n, token: { amount: payout, category: perpetuityUtxo.token.category } })
          .addOutput({ to: executor.address, amount: 1000n, token: { amount: initial - payout, category: perpetuityUtxo.token.category } })
          .send();
      } else {
        // lose out on cost to execute? or rework this to do a balloon payment?
        await new TransactionBuilder({ provider })
          .addInput(perpetuityUtxo, contract.unlock.release())
          .addInput(feesUtxo, executor.signatureTemplate.unlockP2PKH())
          .addOutput({ to: user.address, amount: 1000n, token: { amount: payout, category: perpetuityUtxo.token.category } })
          .addOutput({ to: executor.address, amount: 1000n })
          .send();
      }
    }

    const updated = await provider.getUtxos(contract.tokenAddress);
    setContractUtxos(updated);
    setSubmitting(false);
  }, [network, contractUtxos, contract, provider, user]);
  useEffect(() => {
    let disposed = false;
    const fetch = async () => {
      if (contract) {
        const utxos = await provider.getUtxos(contract.tokenAddress);
        if (!disposed) {
          setContractUtxos(utxos);
        }
      }
    }

    fetch();
    return () => {
      disposed = true;
    };
  }, [provider, contract]);
  useEffect(() => {
    if (network === 'mocknet') {
      setProvider(new MockNetworkProvider())
    } else if (network === 'chipnet' || network === 'mainnet') {
      setProvider(new ElectrumNetworkProvider(network));
    } else {
      console.error('unexpected network value', network)
    }
  }, [network]);

  const isMocknet = network === 'mocknet';

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          EternalCash
        </h1>
      </header>

      <main className="app-main">
        <div className="app-content">
          {
            !contract && (
              <>
                <div style={{ paddingBottom: '1rem' }}>
                  <select name="network" value={network} onChange={(e) => setNetwork(e.target.value)}>
                    <option value="mocknet">Mocknet</option>
                    <option value="chipnet">Chipnet</option>
                    <option value="mainnet">Mainnet</option>
                  </select>
                </div>
                <form onSubmit={onSubmit} style={{ display: 'grid', rowGap: '0.5rem' }}>
                  <div>
                    <label htmlFor='address' style={{ marginRight: '0.5rem' }}>
                      Enter BCH Address:
                    </label>
                    <input id="address" type="text" />
                  </div>
                  <div>
                    <input type="submit" value="Start" />
                  </div>
                  <div style={{ color: 'red' }}>
                    {formError}
                  </div>
                </form>
              </>
            )
          }
          {
            contract && (!contractUtxos || contractUtxos.length === 0) && (
              <div style={{ display: 'grid', rowGap: '1rem' }}>
                <div>
                  <label style={{ marginRight: '0.5rem' }}>Send Tokens:</label>
                  {contract.tokenAddress}
                </div>
                <div>
                  {
                    isMocknet && (
                      <input type='button' value='Refresh' onClick={onMock} />
                    )
                  }
                  {
                    !isMocknet && (
                      <input type='button' value='Refresh' onClick={onRefresh} />
                    )
                  }
                </div>
              </div>
            )
          }
          {
            contract && contractUtxos?.length > 0 && (
              <div style={{ display: 'grid', rowGap: '1rem' }}>
                <div style={{ display: 'grid', rowGap: '0.5rem' }}>
                  There {(contractUtxos.length > 1 ? 'are' : 'is')} {contractUtxos.length} perpetuity contract{(contractUtxos.length > 1 ? 's' : '')} currently running

                  {
                    contractUtxos.map(utxo => (
                      <div>
                        txid: {utxo.txid} <br />
                        token: {utxo?.token.category} <br />
                        amount: {utxo?.token.amount}
                      </div>
                    ))
                  }
                </div>
                <div>
                {
                  isMocknet && (
                      <input type="button" value="Execute" onClick={onMockExecute} disabled={submitting} />
                  )
                }
                {
                  !isMocknet && (
                      <input type="button" value="Execute" onClick={onExecute} disabled={submitting} />
                  )
                }
                  </div>
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
