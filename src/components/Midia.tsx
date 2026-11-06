import type { CSSProperties } from 'react'
import { midiaUrl } from '../lib/api'

// Imagem, vídeo enviado (MP4/WEBM) ou link do YouTube — usado no quiz e no editor do quiz.
export const ehVideo = (src?: string | null) => !!src && /\.(mp4|webm)$/i.test(src)
export function idYoutube(src?: string | null) {
  if (!src) return null
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/.exec(src)
  return m ? m[1] : null
}

export function Midia({ src, style, capa }: { src?: string | null; style?: CSSProperties; capa?: boolean }) {
  if (!src) return null
  const yt = idYoutube(src)
  const base: CSSProperties = { display: 'block', width: '100%', borderRadius: 14, background: '#000', ...style }
  if (yt) return (
    <div style={{ ...base, position: 'relative', paddingTop: '56.25%', overflow: 'hidden' }}>
      <iframe src={`https://www.youtube.com/embed/${yt}?rel=0&playsinline=1`} title="Vídeo" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
    </div>)
  if (ehVideo(src)) return <video src={midiaUrl(src)} controls playsInline preload="metadata" style={{ ...base, maxHeight: capa ? 420 : 320 }} />
  return <img src={midiaUrl(src)} alt="" loading="lazy" style={{ ...base, background: 'transparent', objectFit: 'cover', maxHeight: capa ? 360 : 280 }} />
}
