import { checkBirthdayPassword as c } from '../src/lib/password.ts';
const want='01/01/2000';
const cases: [string, boolean][] = [['01012000',true],['01/01/2000',true],['1/1/2000',true],['01-01-2000',true],['01.01.2000',true],['010100',true],[' 01 01 2000 ',true],['02012000',false],['01/01/1999',false],['',false],['abc',false],['0101200',false]];
let bad=0; for (const [i,e] of cases){ const r=c(i,want); if(r!==e){bad++; console.log('FAIL',JSON.stringify(i),r);} }
console.log(bad ? `${bad} failures` : `password: all ${cases.length} cases pass`);
if (bad) process.exitCode = 1;
