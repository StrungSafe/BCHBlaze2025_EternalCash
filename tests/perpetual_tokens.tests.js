import { Contract, MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo, randomToken } from 'cashscript';
import {
    instantiateSecp256k1,
    instantiateRipemd160,
    instantiateSha256,
    generatePrivateKey,
    binToHex,
    encodeCashAddress,
} from '@bitauth/libauth';

import perpetual from '../art/perpetual_tokens.json' with { type: 'json' };

const secp256k1 = await instantiateSecp256k1();
const ripemd160 = await instantiateRipemd160();
const sha256 = await instantiateSha256();

const ensureSuccess = async (name, build) => {
    const transaction = build();
    try {
        await transaction.send();
    } catch (error) {
        console.log('FAILED: ' + name, error);
        throw new Error("Test Failure: " + name);
    }
    console.log('PASSED: ' + name);
};

const ensureFailure = async (name, build) => {
    
    const transaction = build();
    let fail = false;
    try {
        await transaction.send();
    } catch(error) {
        fail = true;
    }
    if(!fail) {
        console.log('FAILED: ' + name);
        throw new Error("Test Failure: " + name);
    }
    console.log('PASSED: ' + name);
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
const service = generateWallet();
const untrusted = generateWallet();

const provider = new MockNetworkProvider({ updateUtxoSet: false });
const contract = new Contract(perpetual, [user.pubKeyHex], { provider });
const perpetualUtxo = randomUtxo({
    amount: 1000n,
    token: randomToken({
        amount: 10000000n,
    }),
});
const feesUtxo = randomUtxo();
const endOfLifeUtxo = randomUtxo({
    satoshis: 1000n,
    token: randomToken({
        amount: 2n,
    }),
});

provider.addUtxo(contract.address, perpetualUtxo);
provider.addUtxo(contract.address, endOfLifeUtxo);
provider.addUtxo(service.address, feesUtxo);

await ensureSuccess("Release_WhenInvoked_UserGetsPayout", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 1000n, token: { amount: 200000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: 9790000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: service.address, amount: 1000n, token: { amount: 10000n, category: perpetualUtxo.token.category } })
);

await ensureSuccess("Release_WhenInvoked_AnyoneCanService", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 1000n, token: { amount: 200000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: 9790000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: untrusted.address, amount: 1000n, token: { amount: 10000n, category: perpetualUtxo.token.category } })
);

await ensureSuccess("Release_WhenInvoked_CanPayForTransaction", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 1000n, token: { amount: 200000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: 9790000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: untrusted.address, amount: 1000n, token: { amount: 10000n, category: perpetualUtxo.token.category } })
);

await ensureSuccess("Release_WhenInvoked_AtEndOfLife", () => new TransactionBuilder({ provider })
    .addInput(endOfLifeUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 1000n, token: { amount: 1n, category: endOfLifeUtxo.token.category } })
    .addOutput({ to: untrusted.address, amount: 1000n, token: { amount: 1n, category: endOfLifeUtxo.token.category } })
);

/*****************************/

await ensureFailure("Release_WhenInvoked_WithLessThanPayout", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 1000n, token: { amount: 199999n, category: perpetualUtxo.token.category } })
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: 9790000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: service.address, amount: 1000n, token: { amount: 10000n, category: perpetualUtxo.token.category } })
);

await ensureFailure("Release_WhenInvoked_WithMoreThanPayout", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 1000n, token: { amount: 200001n, category: perpetualUtxo.token.category } })
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: 9790000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: service.address, amount: 1000n, token: { amount: 10000n, category: perpetualUtxo.token.category } })
);

await ensureFailure("Release_WhenInvoked_LessReturnedThanExpected", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 1000n, token: { amount: 200000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: 9789999n, category: perpetualUtxo.token.category } })
    .addOutput({ to: service.address, amount: 1000n, token: { amount: 10000n, category: perpetualUtxo.token.category } })
);

await ensureFailure("Release_WhenInvoked_MoreReturnedThanExpected", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 1000n, token: { amount: 200000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: 9790001n, category: perpetualUtxo.token.category } })
    .addOutput({ to: service.address, amount: 1000n, token: { amount: 10000n, category: perpetualUtxo.token.category } })
);

await ensureFailure("Release_WhenInvoked_WithUntrustedPayoutAddress", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: untrusted.address, amount: 1000n, token: { amount: 200000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: 9790000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: service.address, amount: 1000n, token: { amount: 10000n, category: perpetualUtxo.token.category } })
);

await ensureFailure("Release_WhenInvoked_WithUntrustedReturnAddress", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 1000n, token: { amount: 200000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: untrusted.address, amount: 1000n, token: { amount: 9790000n, category: perpetualUtxo.token.category } })
    .addOutput({ to: service.address, amount: 1000n, token: { amount: 10000n, category: perpetualUtxo.token.category } })
);

await ensureFailure("Release_WhenInvoked_WithDifferentPayoutToken", () => {
    const newToken = randomToken();
    return new TransactionBuilder({ provider })
        .addInput(perpetualUtxo, contract.unlock.release())
        .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
        .addOutput({ to: user.address, amount: 1000n, token: { amount: 200000n, category: newToken.category } })
        .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: 9790000n, category: perpetualUtxo.token.category } })
        .addOutput({ to: service.address, amount: 1000n, token: { amount: 210000n, category: perpetualUtxo.token.category } });
});
