import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

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
