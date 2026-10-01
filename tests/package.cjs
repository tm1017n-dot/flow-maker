/* Packaging checks; Windows Script Host execution still needs a Windows machine. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const installer=fs.readFileSync(path.join(root,'Install.vbs'));
const launcher=fs.readFileSync(path.join(root,'Launch.vbs'));
for(const bytes of [installer,launcher])assert([...bytes].every(byte=>byte<128),'VBS must be ASCII for Windows Script Host');
const source=installer.toString('ascii');
const required=source.match(/files = Array\(([^\r\n]+)\)/)[1].match(/"([^"]+)"/g).map(s=>s.slice(1,-1));
assert(required.length>=8);for(const filename of required)assert(fs.statSync(path.join(root,...filename.split('\\'))).isFile(),filename);
assert(required.includes('assets\\flow-maker.ico'));assert(required.includes('assets\\flow-maker.svg'));
assert(!required.some(file=>file.endsWith('.json')),'Installer must not overwrite user documents');
assert(source.includes('link.TargetPath = appEntry'));assert(source.includes('link.IconLocation = appIcon'));
assert(source.includes('shell.SpecialFolders("Desktop")'));assert(source.includes('shell.SpecialFolders("Programs")'));
const ico=fs.readFileSync(path.join(root,'assets/flow-maker.ico'));
assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),7);
const sizes=[];
for(let i=0;i<7;i++){
 const pos=6+i*16,w=ico[pos]||256,h=ico[pos+1]||256,length=ico.readUInt32LE(pos+8),offset=ico.readUInt32LE(pos+12);
 assert.equal(w,h);assert(offset>=6+7*16&&offset+length<=ico.length);assert.equal(ico.subarray(offset,offset+8).toString('hex'),'89504e470d0a1a0a');sizes.push(w);
}
assert.deepEqual(sizes,[16,24,32,48,64,128,256]);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(ids.length,new Set(ids).size);
assert(html.indexOf('id="palette"')>html.indexOf('id="flowView"'));assert(html.indexOf('id="manualOutline"')<html.indexOf('<main'));
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){const relative=match[1];if(!relative.includes('://'))assert(fs.existsSync(path.join(root,relative)),relative);}
console.log('PASS: bundled app files, ASCII VBS, shortcut references, seven-size ICO and HTML asset placement. Windows execution is not tested.');
