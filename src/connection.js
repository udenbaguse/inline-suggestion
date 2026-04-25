import isOnline from 'is-online';

/**
 * Fungsi untuk mengecek apakah ada koneksi internet
 * @returns {Promise<boolean>} True jika ada koneksi, False jika tidak
 */
export async function checkInternetConnection() {
  try {
    return await isOnline();
  } catch (error) {
    console.error('Error checking internet connection:', error.message);
    return false;
  }
}
