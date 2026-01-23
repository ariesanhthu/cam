import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Settings } from '../types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Validate Supabase credentials
const isValidSupabaseConfig = (): boolean => {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase] Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return false;
  }
  try {
    new URL(supabaseUrl);
    return true;
  } catch {
    console.warn('[Supabase] NEXT_PUBLIC_SUPABASE_URL không hợp lệ:', supabaseUrl);
    return false;
  }
};

// Luôn tạo client (với dummy values nếu thiếu config để tránh runtime errors)
// Validation sẽ được check trong các functions sử dụng
const createSupabaseClient = (): SupabaseClient => {
  const url = supabaseUrl || 'https://placeholder.supabase.co';
  const key = supabaseAnonKey || 'placeholder-key';
  
  return createClient(url, key, {
    auth: {
      persistSession: false, // Không persist session cho app này
    },
  });
};

// Tạo client instance
export const supabase = createSupabaseClient();

// Helper để check xem client có hợp lệ không
export const getSupabaseClient = (): SupabaseClient | null => {
  if (!isValidSupabaseConfig()) {
    return null;
  }
  return supabase;
};

// Function để list files trong bucket (debug)
export const listFilesInBucket = async (bucketName: string, folderPath?: string): Promise<string[]> => {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('[Supabase] Không thể list files: client chưa được khởi tạo');
    return [];
  }

  try {
    const { data, error } = await client.storage
      .from(bucketName)
      .list(folderPath || '', {
        limit: 100,
        offset: 0,
      });

    if (error) {
      console.error('[Supabase] Error listing files:', {
        message: error.message,
        name: error.name,
        bucketName,
        folderPath,
      });
      return [];
    }

    const fileNames = data?.map(file => file.name) || [];
    const fullPaths = folderPath 
      ? fileNames.map(name => `${folderPath}/${name}`)
      : fileNames;
    console.log(`[Supabase] Files trong bucket "${bucketName}"${folderPath ? ` folder "${folderPath}"` : ''}:`, fullPaths);
    return fullPaths;
  } catch (error) {
    console.error('[Supabase] Exception khi list files:', {
      error: error instanceof Error ? error.message : String(error),
      bucketName,
      folderPath,
    });
    return [];
  }
};

// Function để lấy ảnh từ Supabase Storage
export const fetchImageFromSupabase = async (bucketName: string, imagePath: string): Promise<Blob | null> => {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('[Supabase] Không thể lấy ảnh: client chưa được khởi tạo');
    console.warn('[Supabase] Config check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
      url: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'missing',
    });
    return null;
  }

  try {
    console.log('[Supabase] Đang download ảnh:', { bucketName, imagePath });
    const { data, error } = await client.storage
      .from(bucketName)
      .download(imagePath)

    if (error) {
      console.error('[Supabase] Error downloading image:', {
        message: error.message,
        name: error.name,
        bucketName,
        imagePath,
      });
      return null
    }

    if (!data) {
      console.warn('[Supabase] Download thành công nhưng data null:', { bucketName, imagePath });
      return null;
    }

    console.log('[Supabase] Download thành công, size:', data.size, 'bytes');
    return data
  } catch (error) {
    console.error('[Supabase] Exception khi fetch image:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      bucketName,
      imagePath,
    });
    return null
  }
}

// Bảng cấu hình đề xuất: table "app_settings" với primary key cố định: id='default'.
// Schema tối thiểu: id: text (PK), data: jsonb
const SETTINGS_TABLE = 'app_settings'
const SETTINGS_ID = 'default'

export const getAppSettingsFromDb = async (): Promise<Partial<Settings> | null> => {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('[Supabase] Không thể lấy settings: client chưa được khởi tạo');
    return null;
  }

  try {
    const { data, error } = await client
      .from(SETTINGS_TABLE)
      .select('data')
      .eq('id', SETTINGS_ID)
      .single()
    
    if (error) {
      // Không log lỗi nếu là "not found" (bình thường khi chưa có data)
      if (error.code !== 'PGRST116') {
        console.warn('[Supabase] get settings error:', error)
      }
      return null
    }
    return (data?.data as Partial<Settings>) || null
  } catch (e) {
    console.warn('[Supabase] get settings exception:', e)
    return null
  }
}

export const saveAppSettingsToDb = async (settings: Settings): Promise<boolean> => {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('[Supabase] Không thể lưu settings: client chưa được khởi tạo. Settings đã được lưu vào localStorage.');
    return false;
  }

  try {
    const payload = { id: SETTINGS_ID, data: settings };
    const { error, status, data } = await client
      .from(SETTINGS_TABLE)
      .upsert(payload, { onConflict: 'id' })
      .select('id');

    if (error) {
      // Log chi tiết hơn để debug
      console.warn('[Supabase] upsert settings error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        // Log thêm thông tin về config nếu có
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnonKey,
        urlLength: supabaseUrl.length,
        keyLength: supabaseAnonKey.length,
      });
      return false;
    }
    console.log('[Supabase] upsert settings ok:', { status, data });
    return true;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.warn('[Supabase] upsert settings exception:', {
      error: errorMessage,
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
      stack: e instanceof Error ? e.stack : undefined,
    });
    return false;
  }
};
