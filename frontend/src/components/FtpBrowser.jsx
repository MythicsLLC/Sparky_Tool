import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, Box, Typography, IconButton,
  CircularProgress, Tooltip, Breadcrumbs, Link,
} from '@mui/material'
import FolderIcon          from '@mui/icons-material/Folder'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import ArrowBackIcon       from '@mui/icons-material/ArrowBack'
import CloseIcon           from '@mui/icons-material/Close'
import RefreshIcon         from '@mui/icons-material/Refresh'
import HomeIcon            from '@mui/icons-material/Home'
import ArticleIcon         from '@mui/icons-material/Article'
import { useThemeContext } from '../ThemeContext'
import { ftpBrowse, ftpReadFile } from '../api'
import MythicsLoader from './MythicsLoader'

const TEXT_EXTS = new Set([
  'csv', 'txt', 'log', 'xml', 'json', 'yaml', 'yml',
  'cfg', 'conf', 'ini', 'env', 'sh', 'sql', 'html', 'htm',
  'properties', 'py', 'js', 'ts',
])

function isTextFile(name) {
  return TEXT_EXTS.has(name.split('.').pop()?.toLowerCase() || '')
}

function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

function ftpPathSegments(path) {
  const clean = (path || '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  const parts = clean.split('/').filter(Boolean)
  const segments = [{ label: '/', path: '/' }]
  for (let i = 0; i < parts.length; i++) {
    segments.push({ label: parts[i], path: '/' + parts.slice(0, i + 1).join('/') })
  }
  return segments
}

function joinFtpPath(base, name) {
  return `${(base || '/').replace(/\/$/, '')}/${name}`
}

export default function FtpBrowser({
  open, onClose,
  ftpHost, ftpPort = 21, ftpUsername = '', ftpPassword = '',
  ftpConnectionType = 'ftp', ftpPassive = true,
}) {
  const { accent, mode } = useThemeContext()
  const isDark = mode === 'dark'

  const [currentPath, setCurrentPath] = useState('/')
  const [history,     setHistory]     = useState([])
  const [items,       setItems]       = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  const [viewFile,    setViewFile]    = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError,   setFileError]   = useState(null)

  const creds = {
    ftp_host: ftpHost, ftp_port: ftpPort,
    ftp_username: ftpUsername, ftp_password: ftpPassword,
    ftp_connection_type: ftpConnectionType, ftp_passive: ftpPassive,
  }

  const browse = useCallback(async (path) => {
    setLoading(true)
    setError(null)
    setItems(null)
    setViewFile(null)
    setFileContent(null)
    try {
      const res = await ftpBrowse({ ...creds, path })
      setItems(res.data.items || [])
      setCurrentPath(path)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to list directory')
    } finally {
      setLoading(false)
    }
  }, [ftpHost, ftpUsername, ftpPassword, ftpPort, ftpConnectionType, ftpPassive]) // eslint-disable-line

  useEffect(() => {
    if (open && ftpHost && ftpPassword) {
      setHistory([])
      setCurrentPath('/')
      browse('/')
    }
  }, [open]) // eslint-disable-line

  const navigateTo = (path) => {
    setHistory((h) => [...h, currentPath])
    browse(path)
  }

  const goBack = () => {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    browse(prev)
  }

  const openFile = async (path, name) => {
    setViewFile({ path, name })
    setFileContent(null)
    setFileError(null)
    setFileLoading(true)
    try {
      const res = await ftpReadFile({ ...creds, path })
      setFileContent(res.data.content)
    } catch (err) {
      setFileError(err.response?.data?.detail ?? 'Failed to read file')
    } finally {
      setFileLoading(false)
    }
  }

  const segments = ftpPathSegments(currentPath)
  const protocol = ftpConnectionType === 'ftps' ? 'FTPS' : 'FTP'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          border: `1px solid ${accent}33`,
          borderRadius: '2px',
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ height: 2, flexShrink: 0, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

        {/* Header */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.5,
          px: 2.5, py: 1.5,
          borderBottom: `1px solid ${accent}1f`,
          bgcolor: `${accent}06`,
          flexShrink: 0,
        }}>
          <Tooltip title="Back" arrow>
            <span>
              <IconButton size="small" onClick={goBack} disabled={history.length === 0}
                sx={{ color: history.length ? accent : 'text.disabled' }}>
                <ArrowBackIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Home (/)" arrow>
            <IconButton size="small" onClick={() => { setHistory([]); browse('/') }} sx={{ color: accent }}>
              <HomeIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh" arrow>
            <IconButton size="small" onClick={() => browse(currentPath)} sx={{ color: accent }}>
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>

          <Breadcrumbs sx={{ flex: 1, '& .MuiBreadcrumbs-separator': { mx: 0.5 } }}>
            {segments.map((seg, i) => (
              i < segments.length - 1 ? (
                <Link key={seg.path} component="button" onClick={() => navigateTo(seg.path)}
                  underline="hover"
                  sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: accent, cursor: 'pointer', border: 'none', background: 'none', p: 0 }}>
                  {seg.label}
                </Link>
              ) : (
                <Typography key={seg.path}
                  sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.primary' }}>
                  {seg.label}
                </Typography>
              )
            ))}
          </Breadcrumbs>

          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', color: 'text.disabled', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {protocol} · {ftpHost}
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: 'text.disabled', '&:hover': { color: accent } }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>

        {/* Body */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* File list */}
          <Box sx={{ flex: viewFile ? '0 0 45%' : '1', overflow: 'auto', borderRight: viewFile ? `1px solid ${accent}1f` : 'none' }}>
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
                <MythicsLoader size={48} />
              </Box>
            )}
            {error && (
              <Box sx={{ px: 3, pt: 4 }}>
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: '#c98f8f' }}>{error}</Typography>
              </Box>
            )}
            {!loading && !error && items !== null && (
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
                <Box component="thead">
                  <Box component="tr" sx={{ borderBottom: `1px solid ${accent}14` }}>
                    {['Name', 'Size', 'Modified'].map((h) => (
                      <Box key={h} component="th" sx={{ px: 2.5, py: 1, textAlign: 'left', fontFamily: '"Raleway", sans-serif', fontSize: '0.55rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.disabled', fontWeight: 700 }}>
                        {h}
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Box component="tbody">
                  {items.length === 0 && (
                    <Box component="tr">
                      <Box component="td" colSpan={3} sx={{ px: 2.5, py: 3, fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', color: 'text.disabled', textAlign: 'center' }}>
                        Empty directory
                      </Box>
                    </Box>
                  )}
                  {items.map((item) => {
                    const isDir = item.type === 'dir'
                    const itemPath = joinFtpPath(currentPath, item.name)
                    const canOpen = !isDir && isTextFile(item.name)
                    return (
                      <Box key={item.name} component="tr"
                        onClick={() => isDir ? navigateTo(itemPath) : canOpen ? openFile(itemPath, item.name) : undefined}
                        sx={{
                          cursor: isDir || canOpen ? 'pointer' : 'default',
                          borderBottom: `1px solid ${accent}0a`,
                          bgcolor: viewFile?.path === itemPath ? `${accent}10` : 'transparent',
                          '&:hover': { bgcolor: `${accent}09` },
                        }}>
                        <Box component="td" sx={{ px: 2.5, py: 1, display: 'flex', alignItems: 'center', gap: 1.2 }}>
                          {isDir
                            ? <FolderIcon sx={{ fontSize: 15, color: accent }} />
                            : canOpen
                              ? <ArticleIcon sx={{ fontSize: 15, color: accent }} />
                              : <InsertDriveFileIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
                          }
                          <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: isDir ? accent : 'text.primary' }}>
                            {item.name}
                          </Typography>
                        </Box>
                        <Box component="td" sx={{ px: 2.5, py: 1, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.65rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {isDir ? '—' : formatSize(item.size)}
                        </Box>
                        <Box component="td" sx={{ px: 2.5, py: 1, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.65rem', color: 'text.disabled', whiteSpace: 'nowrap' }}>
                          {formatDate(item.modified)}
                        </Box>
                      </Box>
                    )
                  })}
                </Box>
              </Box>
            )}
          </Box>

          {/* File viewer */}
          {viewFile && (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderBottom: `1px solid ${accent}1f`, bgcolor: `${accent}04`, flexShrink: 0 }}>
                <ArticleIcon sx={{ fontSize: 14, color: accent }} />
                <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {viewFile.name}
                </Typography>
                <IconButton size="small" onClick={() => setViewFile(null)} sx={{ color: 'text.disabled', '&:hover': { color: accent } }}>
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
              <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                {fileLoading && <CircularProgress size={20} sx={{ color: accent }} />}
                {fileError && <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: '#c98f8f' }}>{fileError}</Typography>}
                {fileContent != null && (
                  <Box component="pre" sx={{ m: 0, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: isDark ? '#d4d4d4' : '#333', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {fileContent}
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
