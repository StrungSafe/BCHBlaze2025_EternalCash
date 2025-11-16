import { Contract, MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo } from 'cashscript';
import {
    instantiateSecp256k1,
    instantiateRipemd160,
    instantiateSha256,
    generatePrivateKey,
    binToHex,
    encodeCashAddress,
} from '@bitauth/libauth';

import perpetual from '../art/perpetual.json' with { type: 'json' };

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
const attacker = generateWallet();
const service = generateWallet();

const provider = new MockNetworkProvider({ updateUtxoSet: false });
const contract = new Contract(perpetual, [user.pubKeyHex], { provider });
const perpetualUtxo = randomUtxo({ 
    satoshis: 10000000n,
});
const feesUtxo = randomUtxo({
    satoshis: 123456n
});
const endUtxo = randomUtxo({
    satoshis: 1n,
});

provider.addUtxo(contract.address, perpetualUtxo);
provider.addUtxo(service.address, feesUtxo);
provider.addUtxo(contract.address, endUtxo);



// await ensureSuccess("Release_WhenInvoked_EndOfLife", () => new TransactionBuilder({ provider })
//     .addInput(endUtxo, contract.unlock.release())
// );

await ensureSuccess("Release_WhenInvoked_UserGetsPayout", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 200000n })
    .addOutput({ to: service.address, amount: 10000n })
    .addOutput({ to: contract.address, amount: 9790000n })
);

await ensureSuccess("Release_WhenInvoked_AnyoneCanService", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 200000n })
    .addOutput({ to: attacker.address, amount: 10000n })
    .addOutput({ to: contract.address, amount: 9790000n })
);

await ensureSuccess("Release_WhenInvoked_CanPayForTransaction", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 200000n })
    .addOutput({ to: attacker.address, amount: 10000n })
    .addOutput({ to: contract.address, amount: 9790000n })
);

await ensureFailure("Release_WhenInvoked_WithLessThanPayout", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 199999n })
    .addOutput({ to: service.address, amount: 10000n })
    .addOutput({ to: contract.address, amount: 9790000n })
);

await ensureFailure("Release_WhenInvoked_WithMoreThanPayout", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 200001n })
    .addOutput({ to: service.address, amount: 10000n })
    .addOutput({ to: contract.address, amount: 9790000n })
);

await ensureFailure("Release_WhenInvoked_LessReturnedThanExpected", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 200000n })
    .addOutput({ to: service.address, amount: 10000n })
    .addOutput({ to: contract.address, amount: 9789999n })
);

await ensureFailure("Release_WhenInvoked_MoreReturnedThanExpected", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 200000n })
    .addOutput({ to: service.address, amount: 10000n })
    .addOutput({ to: contract.address, amount: 9790001n })
);

await ensureFailure("Release_WhenInvoked_WithAttackerPayoutAddress", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: attacker.address, amount: 200000n })
    .addOutput({ to: service.address, amount: 10000n })
    .addOutput({ to: contract.address, amount: 9790000n })
);

await ensureFailure("Release_WhenInvoked_WithAttackerReturnAddress", () => new TransactionBuilder({ provider })
    .addInput(perpetualUtxo, contract.unlock.release())
    .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
    .addOutput({ to: user.address, amount: 200000n })
    .addOutput({ to: service.address, amount: 10000n })
    .addOutput({ to: attacker.address, amount: 9790000n })
);