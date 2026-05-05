import { checkInternetConnection } from './src/connection.js';
import { initializeCodeModel } from './src/model.js';

async function testOfflineMode() {
  console.log('Testing offline mode...');
  
  // Check internet status first
  const hasInternet = await checkInternetConnection();
  console.log('Internet connection:', hasInternet);
  
  if (hasInternet) {
    console.log('To test offline mode, please disconnect from internet or set ALLOW_WHEN_ONLINE=true');
    console.log('Testing with allowWhenOnline option instead...');
    
    // Test the suggester with allowWhenOnline
    const { createDebouncedSuggester } = await import('./src/index.js');
    const suggester = createDebouncedSuggester({
      delayMs: 100,
      allowWhenOnline: true // Allow suggestions even when online
    });
    
    try {
      console.log('Requesting suggestion...');
      const suggestion = await suggester.suggest('function calculateSum(a, b) {');
      console.log('Suggestion received:', suggestion);
    } catch (error) {
      console.error('Error getting suggestion:', error.message);
    }
  } else {
    // Actually offline, test normally
    try {
      console.log('Initializing model...');
      const model = await initializeCodeModel();
      console.log('Model initialized:', !!model);
      
      console.log('Generating suggestion...');
      const suggestion = await model.generateCodeSuggestion('function calculateSum(a, b) {');
      console.log('Suggestion:', suggestion);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}

testOfflineMode().catch(console.error);