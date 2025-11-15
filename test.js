import { Contract, MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo } from 'cashscript';
import {
    instantiateSecp256k1,
    instantiateRipemd160,
    instantiateSha256,
    generatePrivateKey,
    binToHex,
    encodeCashAddress,
} from '@bitauth/libauth';

import perpetual from './art/perpetual.json' with { type: 'json' };

const secp256k1 = await instantiateSecp256k1();
const ripemd160 = await instantiateRipemd160();
const sha256 = await instantiateSha256();

const ensureSuccess = async (test, build) => {
    const transaction = build();
    await transaction.send();
};

const ensureFailure = async (test, build) => {
    const transaction = build();
    let fail = false;
    try {
        await transaction.send();
    } catch(error) {
        fail = true;
    }
    if(!fail) {
        throw new Error("Test Failure");
    }
}

const network = 'mocknet';

const generateWallet = () => {
    const privateKey = generatePrivateKey();
    const pubKeyBin = secp256k1.derivePublicKeyCompressed(privateKey);
    const pubKeyHex = binToHex(pubKeyBin);
    const signatureTemplate = new SignatureTemplate(privateKey);
    const pubKeyHash = ripemd160.hash(sha256.hash(pubKeyBin));
    const encoded = encodeCashAddress({ prefix: network === 'mainnet' ? 'bitcoincash' : 'bchtest', type: 'p2pkhWithTokens', payload: pubKeyHash });
    return { privateKey, pubKeyHex, signatureTemplate, address: typeof encoded === 'string' ? encoded : encoded.address };
};

const user = generateWallet();
const attacker = generateWallet();
const service = generateWallet();

const provider = new MockNetworkProvider({ updateUtxoSet: false });
const contract = new Contract(perpetual, [user.pubKeyHex], { provider, addressType: 'p2sh20' });
const mockUtxo = randomUtxo({ 
    satoshis: 10000000n,
});

provider.addUtxo(contract.address, mockUtxo);

ensureSuccess("Release_WhenInvoked_UserGetsTwoPercentPayout", () => new TransactionBuilder({ provider })
    .addInput(mockUtxo, contract.unlock.release())
    .addOutput({ to: user.address, amount: 200000n })
    .addOutput({ to: service.address, amount: 10000n })
    .addOutput({ to: contract.address, amount: 9790000n })
);

ensureFailure("Release_WhenInvoked_AttackerUnableToGetPayout", () => new TransactionBuilder({ provider })
    .addInput(mockUtxo, contract.unlock.release())
    .addOutput({ to: attacker.address, amount: 200000n })
    .addOutput({ to: service.address, amount: 10000n })
    .addOutput({ to: contract.address, amount: 9790000n })
);