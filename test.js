import { Contract, MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo } from 'cashscript';
import {
    generatePrivateKey,
    instantiateSecp256k1,
    binToHex,
} from '@bitauth/libauth';

import gameArtifact from '../artifacts/perpetual.artc'

import 'cashscript/jest';

const secp256k1 = await instantiateSecp256k1();

const generateWallet = () => {
    const privateKey = generatePrivateKey();
    const pubKeyBin = secp256k1.derivePublicKeyCompressed(privateKey);
    const pubKeyHex = binToHex(pubKeyBin);
    const signatureTemplate = new SignatureTemplate(privateKey);
    return { privateKey, pubKeyHex, signatureTemplate };
};

describe('', () => {
    const provider = new MockNetworkProvider();
    const { xWallet, oWallet } = { xWallet: generateWallet(), oWallet: generateWallet() };
    const gameContract = new Contract(gameArtifact, [xWallet.pubKeyHex, oWallet.pubKeyHex], { provider });
    const utxo = provider.addUtxo(gameContract.address, randomUtxo());

    it('', () => {
        const transaction = new TransactionBuilder({ provider })
            .addInput(utxo, gameContract.play(xWallet.signatureTemplate));
        expect(transaction).not.toFailRequire();
    });
});