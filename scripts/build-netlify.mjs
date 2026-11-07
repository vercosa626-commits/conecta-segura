import {buildPages} from './build-pages.mjs';
await buildPages({directory:'dist-netlify',apiBase:'',staticMode:false,manifestBase:'/'});
console.log('Netlify: frontend na raiz e API na mesma origem; segredos somente nas Functions.');
