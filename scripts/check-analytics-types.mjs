import ts from 'typescript';
import path from 'node:path';

// Type-check the real dependency graph, but make this focused gate responsible
// only for analytics/admin entrypoints. The existing whole-game gate is separate.
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);
if(config.error)throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,process.cwd());
const program=ts.createProgram(parsed.fileNames,{...parsed.options,noEmit:true});
const diagnostics=ts.getPreEmitDiagnostics(program),entrypoints=new Set(['src/main.ts','src/landing-auth.ts','src/auth/googleAuth.ts']);
const own=diagnostics.filter(d=>{if(!d.file)return true;const file=path.relative(process.cwd(),d.file.fileName).split(path.sep).join('/');
  return file.startsWith('src/admin/')||file.startsWith('src/telemetry/')||entrypoints.has(file);});
if(own.length){console.error(ts.formatDiagnosticsWithColorAndContext(own,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));process.exitCode=1;}
else console.log('Analytics/admin frontend types: PASS. Whole-game typecheck remains a separate gate.');
