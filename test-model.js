import { initializeCodeModel } from './src/model.js';

console.log('Testing model initialization...');
initializeCodeModel()
  .then(model => {
    console.log('Model initialized successfully!');
    console.log('Model:', !!model);
  })
  .catch(error => {
    console.error('Failed to initialize model:');
    console.error(error);
  });

  
  