import fs from 'node:fs';
const src=fs.readFileSync('launch-readiness.html','utf8');
const marker='<script src="assets/launch-readiness.js"></script>';
if(!src.includes(marker))throw new Error('Launch template script marker not found');
const built=src.replace(marker,marker+'\n<script src="assets/launch-evidence.js"></script>');
fs.writeFileSync('launch-ready.html',built);
console.log('Built launch-ready.html with core logic and evidence-scoring extension.');
