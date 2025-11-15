import { compileFile } from 'cashc';
import { writeFile } from 'fs';

const artifact = compileFile(new URL('perpetual.cashc', import.meta.url));
writeFile('src/artifacts/perpetual.artc', JSON.stringify(artifact), error => {
    if(error) {
        throw error;
    }
});
