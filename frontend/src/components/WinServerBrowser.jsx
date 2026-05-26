import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, Box, Typography, IconButton,
  CircularProgress, Tooltip, Breadcrumbs, Link,
} from '@mui/material'
import FolderIcon          from '@mui/icons-material/Folder'
import FolderOpenIcon      from '@mui/icons-material/FolderOpen'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import ArrowBackIcon       from '@mui/icons-material/ArrowBack'
import CloseIcon           from '@mui/icons-material/Close'
import RefreshIcon         from '@mui/icons-material/Refresh'
import HomeIcon            from '@mui/icons-material/Home'
import ArticleIcon         from '@mui/icons-material/Article'
import { useThemeContext } from '../ThemeContext'
import { winBrowse, winReadFile } from '../api'

// Text file extensions that can be opened in the viewer
const TEXT_EXTS = new Set([
  'xml', 'properties', 'cfg', 'conf', 'ini', 'log', 'txt',
  'json', 'yaml', 'yml', 'env', 'sh', 'bat', 'ps1', 'sql',
  'html', 'htm', 'css', 'js', 'py', 'java',
])

function isTextFile(name) {
  const ext = name.split('.').pop()?.toLowerCase()
  return TEXT_EXTS.has(ext)
}

function fileExt(name) {
  return name.split('.').pop()?.toLowerCase() || ''
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

// Build breadcrumb segments from a Windows path like C:\foo\bar
function pathSegments(path) {
  const parts = path.replace(/\//g, '\\').split('\\').filter(Boolean)
  const segments = []
  for (let i = 0; i < parts.length; i++) {
    // Reconstruct paths: C: → C:\, then C:\foo, C:\foo\bar …
    let full
    if (i === 0) {
      full = parts[0] + '\\'
    } else {
      full = parts.slice(0, i + 1).join('\\')
      // Make sure top-level drive letter has trailing backslash
      if (i === 1) full = parts[0] + '\\' + parts[1]
    }
    segments.push({ label: parts[i], path: full })
  }
  return segments
}

const PROTOCOL_LABELS = { winrm: 'WinRM', smb: 'SMB', ssh: 'SSH' }

export default function WinServerBrowser({
  open, onClose,
  winHost, winUsername, winPassword, winPort = 5985, winUseSsl = false,
  winAuthType = 'ntlm',
  connectionType = 'winrm',
  winShare = 'C$',
  winDomain = '',
  rootPath,
}) {
  const { accent, mode } = useThemeContext()
  const isDark = mode === 'dark'

  const [currentPath, setCurrentPath] = useState(rootPath || 'C:\\')
  const [history,     setHistory]     = useState([])
  const [items,       setItems]       = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  // File viewer state
  const [viewFile,    setViewFile]    = useState(null)   // { path, name }
  const [fileContent, setFileContent] = useState(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError,   setFileError]   = useState(null)

  const creds = {
    win_host: winHost, win_username: winUsername, win_password: winPassword,
    win_port: winPort, win_use_ssl: winUseSsl, win_auth_type: winAuthType,
    win_connection_type: connectionType, win_share: winShare, win_domain: winDomain,
  }

  const browse = useCallback(async (path) => {
    setLoading(true)
    setError(null)
    setItems(null)
    setViewFile(null)
    setFileContent(null)
    try {
      const res = await winBrowse({ ...creds, path })
      setItems(res.data.items || [])
      setCurrentPath(path)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to list directory')
    } finally {
      setLoading(false)
    }
  }, [winHost, winUsername, winPassword, winPort, winUseSsl, winAuthType, connectionType, winShare, winDomain])

  // Load root path when dialog opens
  useEffect(() => {
    if (open && winHost && winUsername && winPassword) {
      const start = rootPath || 'C:\\'
      setHistory([])
      setCurrentPath(start)
      browse(start)
    }
  }, [open])  // eslint-disable-line

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

  const goHome = () => {
    const start = rootPath || 'C:\\'
    setHistory([])
    browse(start)
  }

  const openFile = async (path, name) => {
    setViewFile({ path, name })
    setFileContent(null)
    setFileError(null)
    setFileLoading(true)
    try {
      const res = await winReadFile({ ...creds, path })
      setFileContent(res.data.content)
    } catch (err) {
      setFileError(err.response?.data?.detail ?? 'Failed to read file')
    } finally {
      setFileLoading(false)
    }
  }

  const segments = pathSegments(currentPath)

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
      {/* Accent top stripe */}
      <Box sx={{ height: 2, flexShrink: 0, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

        {/* ── Header bar ── */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.5,
          px: 2.5, py: 1.5,
          borderBottom: `1px solid ${accent}1f`,
          bgcolor: `${accent}06`,
          flexShrink: 0,
        }}>
          {/* Nav buttons */}
          <Tooltip title="Back" arrow>
            <span>
              <IconButton
                size="small"
                onClick={goBack}
                disabled={history.length === 0}
                sx={{ color: history.length ? accent : 'text.disabled', p: 0.5 }}
              >
                <ArrowBackIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Root path" arrow>
            <IconButton size="small" onClick={goHome} sx={{ color: 'text.secondary', p: 0.5, '&:hover': { color: accent } }}>
              <HomeIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh" arrow>
            <IconButton size="small" onClick={() => browse(currentPath)} disabled={loading} sx={{ color: 'text.secondary', p: 0.5, '&:hover': { color: accent } }}>
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>

          {/* Breadcrumb */}
          <Breadcrumbs
            separator="›"
            sx={{
              flex: 1, ml: 0.5,
              '& .MuiBreadcrumbs-separator': { color: 'text.disabled', mx: 0.25 },
              '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' },
            }}
          >
            {segments.map((seg, i) =>
              i < segments.length - 1 ? (
                <Link
                  key={seg.path}
                  component="button"
                  onClick={() => { setHistory((h) => [...h, currentPath]); browse(seg.path) }}
                  underline="hover"
                  sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: accent, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {seg.label}
                </Link>
              ) : (
                <Typography
                  key={seg.path}
                  sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.primary', whiteSpace: 'nowrap' }}
                >
                  {seg.label}
                </Typography>
              )
            )}
          </Breadcrumbs>

          {/* Server info chip */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.4, border: `1px solid ${accent}22`, borderRadius: '2px', bgcolor: `${accent}08`, flexShrink: 0 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#6b8f71', boxShadow: '0 0 5px rgba(107,143,113,0.7)' }} />
            <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {winHost}
            </Typography>
            <Box sx={{ px: 0.75, py: 0.15, bgcolor: `${accent}18`, borderRadius: '2px' }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em', color: accent }}>
                {PROTOCOL_LABELS[connectionType] || connectionType.toUpperCase()}
              </Typography>
            </Box>
          </Box>

          {/* Close */}
          <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary', p: 0.5, '&:hover': { color: 'text.primary' } }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        {/* ── Body: file list + optional file viewer ── */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* File list pane */}
          <Box sx={{
            width: viewFile ? '40%' : '100%',
            flexShrink: 0,
            overflowY: 'auto',
            borderRight: viewFile ? `1px solid ${accent}1f` : 'none',
            transition: 'width 0.2s ease',
          }}>
            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                <CircularProgress size={28} sx={{ color: accent }} />
              </Box>
            )}

            {error && !loading && (
              <Box sx={{ px: 3, py: 3 }}>
                <Box sx={{ p: 2, border: `1px solid rgba(143,74,74,0.3)`, bgcolor: 'rgba(143,74,74,0.06)', borderRadius: '2px' }}>
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: '#c98f8f', lineHeight: 1.6 }}>
                    {error}
                  </Typography>
                </Box>
              </Box>
            )}

            {!loading && !error && items !== null && (
              <>
                {items.length === 0 ? (
                  <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
                    <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: 'text.disabled' }}>
                      Empty directory
                    </Typography>
                  </Box>
                ) : (
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
                    {/* Column headers */}
                    <Box component="thead">
                      <Box component="tr" sx={{ borderBottom: `1px solid ${accent}1a` }}>
                        {['Name', 'Modified', 'Size'].map((h) => (
                          <Box component="th" key={h} sx={{ px: 2.5, py: 1, textAlign: h === 'Size' ? 'right' : 'left' }}>
                            <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.disabled' }}>
                              {h}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                    <Box component="tbody">
                      {items.map((item) => {
                        const isDir  = item.Type === 'dir'
                        const canOpen = !isDir && isTextFile(item.Name)
                        const isActive = viewFile?.name === item.Name

                        return (
                          <Box
                            component="tr"
                            key={item.Name}
                            onClick={() => {
                              if (isDir) {
                                const next = currentPath.endsWith('\\')
                                  ? currentPath + item.Name
                                  : currentPath + '\\' + item.Name
                                navigateTo(next)
                              } else if (canOpen) {
                                const filePath = currentPath.endsWith('\\')
                                  ? currentPath + item.Name
                                  : currentPath + '\\' + item.Name
                                openFile(filePath, item.Name)
                              }
                            }}
                            sx={{
                              cursor: isDir || canOpen ? 'pointer' : 'default',
                              bgcolor: isActive ? `${accent}12` : 'transparent',
                              '&:hover': { bgcolor: isDir || canOpen ? `${accent}0a` : 'transparent' },
                              borderBottom: `1px solid ${accent}0a`,
                              transition: 'background 0.1s',
                            }}
                          >
                            {/* Name */}
                            <Box component="td" sx={{ px: 2.5, py: 0.85 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                {isDir
                                  ? <FolderIcon sx={{ fontSize: 17, color: accent, flexShrink: 0 }} />
                                  : canOpen
                                    ? <ArticleIcon sx={{ fontSize: 17, color: `${accent}aa`, flexShrink: 0 }} />
                                    : <InsertDriveFileIcon sx={{ fontSize: 17, color: 'text.disabled', flexShrink: 0 }} />
                                }
                                <Typography sx={{
                                  fontFamily: '"Raleway", sans-serif',
                                  fontSize: '0.78rem',
                                  color: isDir ? accent : canOpen ? 'text.primary' : 'text.secondary',
                                  fontWeight: isDir ? 600 : 400,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: viewFile ? 160 : 380,
                                }}>
                                  {item.Name}
                                </Typography>
                              </Box>
                            </Box>
                            {/* Modified */}
                            <Box component="td" sx={{ px: 2, py: 0.85 }}>
                              <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: 'text.disabled', whiteSpace: 'nowrap' }}>
                                {formatDate(item.Modified)}
                              </Typography>
                            </Box>
                            {/* Size */}
                            <Box component="td" sx={{ px: 2.5, py: 0.85, textAlign: 'right' }}>
                              <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.62rem', color: 'text.secondary' }}>
                                {isDir ? '' : formatSize(item.SizeBytes)}
                              </Typography>
                            </Box>
                          </Box>
                        )
                      })}
                    </Box>
                  </Box>
                )}

                {/* Status bar */}
                <Box sx={{ px: 2.5, py: 0.75, borderTop: `1px solid ${accent}12`, mt: 'auto' }}>
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', color: 'text.disabled', letterSpacing: '0.08em' }}>
                    {items.filter(i => i.Type === 'dir').length} folder{items.filter(i => i.Type === 'dir').length !== 1 ? 's' : ''},&nbsp;
                    {items.filter(i => i.Type === 'file').length} file{items.filter(i => i.Type === 'file').length !== 1 ? 's' : ''}
                  </Typography>
                </Box>
              </>
            )}
          </Box>

          {/* File viewer pane */}
          {viewFile && (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* File viewer header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, py: 1.25, borderBottom: `1px solid ${accent}1f`, bgcolor: `${accent}05`, flexShrink: 0 }}>
                <FolderOpenIcon sx={{ fontSize: 14, color: accent }} />
                <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {viewFile.name}
                </Typography>
                <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.54rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: accent, flexShrink: 0 }}>
                  .{fileExt(viewFile.name)}
                </Typography>
                <IconButton size="small" onClick={() => { setViewFile(null); setFileContent(null) }} sx={{ color: 'text.disabled', p: 0.3, '&:hover': { color: 'text.primary' } }}>
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>

              {/* File content */}
              <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                {fileLoading && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
                    <CircularProgress size={24} sx={{ color: accent }} />
                  </Box>
                )}
                {fileError && (
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: '#c98f8f', p: 1 }}>
                    {fileError}
                  </Typography>
                )}
                {fileContent != null && !fileLoading && (
                  <Box
                    component="pre"
                    sx={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: '0.72rem',
                      color: 'text.primary',
                      lineHeight: 1.75,
                      m: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                      p: 1.5,
                      borderRadius: '2px',
                      border: `1px solid ${accent}12`,
                    }}
                  >
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
