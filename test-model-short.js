import { initializeCodeModel, generateCodeSuggestion } from './src/model.js';

console.log('Testing model initialization with short timeout...');
const startTime = Date.now();

initializeCodeModel()
  .then(model => {
    const endTime = Date.now();
    console.log(`Model initialized successfully in ${endTime - startTime}ms!`);
    console.log('Model:', !!model);
    
    // Test generation
    return generateCodeSuggestion('function hello() {');
  })
  .then(suggestion => {
    console.log('Generated suggestion:', suggestion);
  })
  .catch(error => {
    const endTime = Date.now();
    console.error(`Failed after ${endTime - startTime}ms:`);
    console.error(error.message);
  });