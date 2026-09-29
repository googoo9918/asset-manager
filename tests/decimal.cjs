/** Monetary parsing must preserve integer precision, including BigDecimal exponent strings. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/main/resources/static/js/common/core.js'),'utf8');
const context={};vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('const decimal ='),source.indexOf('const fmt =')),context);
const parse=value=>{context.value=value;return vm.runInContext('decimal(value)',context);};
for(const [input,expected] of [
 ['0E-8',0n],['0E+8',0n],['-0E-20',0n],['1E-8',1n],['1e-9',0n],['-1.5e-8',-1n],
 ['1.234567899E1',1234567899n],['+1e3',100000000000n],['1.25E+4',1250000000000n],
 ['9007199254740993.12345678',900719925474099312345678n],
 ['9.00719925474099312345678E15',900719925474099312345678n],
 ['.5',50000000n],['-.5',-50000000n],[' 1.20 ',120000000n],['',0n],[null,0n],
 ['-123.123456789',-12312345678n]
])assert.equal(parse(input),expected,String(input));
for(const input of ['NaN','Infinity','1E','1.2.3','1e10001','.','e3'])assert.throws(()=>parse(input));
assert.equal(vm.runInContext('mul("0E-8","12345")',context),'0.00000000');
assert.equal(vm.runInContext('sum(["1.5E2","-2.5E1","0E-8"])',context),'125.00000000');
console.log('PASS exact monetary parsing: exponent notation, zero, signs, precision beyond Number, eight-place truncation, arithmetic');
