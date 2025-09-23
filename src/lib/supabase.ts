import { createClient } from '@supabase/supabase-js'
import type { Settings } from '../types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY');
}
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Function để lấy ảnh từ Supabase Storage
export const fetchImageFromSupabase = async (bucketName: string, imagePath: string): Promise<Blob | null> => {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(imagePath)

    if (error) {
      console.error('Error downloading image from Supabase:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Error fetching image from Supabase:', error)
    return null
  }
}

// Bảng cấu hình đề xuất: table "app_settings" với primary key cố định: id='default'.
// Schema tối thiểu: id: text (PK), data: jsonb
const SETTINGS_TABLE = 'app_settings'
const SETTINGS_ID = 'default'

export const getAppSettingsFromDb = async (): Promise<Partial<Settings> | null> => {
  try {
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select('data')
      .eq('id', SETTINGS_ID)
      .single()
    if (error) {
      console.warn('[Supabase] get settings error:', error)
      return null
    }
    return (data?.data as Partial<Settings>) || null
  } catch {
    console.warn('[Supabase] get settings exception')
    return null
  }
}

export const saveAppSettingsToDb = async (settings: Settings): Promise<boolean> => {
  try {
    const payload = { id: SETTINGS_ID, data: settings }
    const { data, error, status } = await supabase
      .from(SETTINGS_TABLE)
      .upsert(payload, { onConflict: 'id' })
    if (error) {
      console.warn('[Supabase] upsert settings error:', error)
      return false
    }
    console.log('[Supabase] upsert settings ok:', { status, data })
    return true
  } catch (e) {
    console.warn('[Supabase] upsert settings exception:', e)
    return false
  }
}
