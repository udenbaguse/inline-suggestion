// Debug version that shows each step
import { pipeline, env } from '@xenova/transformers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

console.log('Starting debug...');
console.log('Node version:', process.version);

try {
  console.log('Checking for xenova/transformers...');
  const transformers = require('@xenova/transformers');
  console.log('Transformers imported successfully');
  
  console.log('Checking fs...');
  console.log('fs.existsSync:', typeof fs.existsSync);
  
  console.log('Checking os...');
  console.log('os.homedir():', os.homedir());
  
  console.log('Checking path...');
  console.log('path.join:', typeof path.join);
  
} catch (importError) {
  console.error('Import error:', importError.message);
}

// Test basic connection check
import { checkInternetConnection } from './src/connection.js';
console.log('Connection function imported');

(async () => {
  try {
    console.log('Checking internet connection...');
    const connected = await checkInternetConnection();
    console.log('Internet connected:', connected);
  } catch (connError) {
    console.error('Connection check error:', connError.message);
  }
})();