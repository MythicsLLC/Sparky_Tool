import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog, DialogContent, Box, Typography, IconButton,
  CircularProgress, Tooltip, InputBase, Chip,
} from '@mui/material'
import FolderIcon          from '@mui/icons-material/Folder'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import ArrowBackIcon       from '@mui/icons-material/ArrowBack'
import ArrowUpwardIcon     from '@mui/icons-material/ArrowUpward'
import CloseIcon           from '@mui/icons-material/Close'
import RefreshIcon         from '@mui/icons-material/Refresh'
import HomeIcon            from '@mui/icons-material/Home'
import ArticleIcon         from '@mui/icons-material/Article'
import SearchIcon          from '@mui/icons-material/Search'
import ContentCopyIcon     from '@mui/icons-material/ContentCopy'
import ArrowDropUpIcon     from '@mui/icons-material/ArrowDropUp'
import ArrowDropDownIcon   from '@mui/icons-material/ArrowDropDown'
import UnfoldMoreIcon      from '@mui/icons-material/UnfoldMore'
import { useThemeContext } from '../ThemeContext'
import { ftpBrowse, ftpReadFile, formatApiError } from '../api'
import MythicsLoader from './MythicsLoader'

const TEXT_EXTS = new Set([
  'csv', 'txt', 'log', 'xml', 'json', 'yaml', 'yml', 'cfg', 'conf', 'ini',
  'env', 'sh', 'bash', 'zsh', 'sql', 'html', 'htm', 'css', 'js', 'ts',
  'py', 'rb', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'md', 'rst', 'toml',
  'properties', 'gitignore', 'dockerignore', 'bat', 'ps1',
])

function isTextFile(name) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return TEXT_EXTS.has(ext)
}

function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
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

function parentPath(path) {
  const clean = (path || '/').replace(/\/+$/, '')
  if (!clean || clean === '/') return null
  const idx = clean.lastIndexOf('/')
  return idx <= 0 ? '/' : clean.slice(0, idx)
}

function joinFtpPath(base, name) {
  const b = (base || '/').replace(/\/+$/, '')
  return `${b}/${name}`
}

function SortIcon({ active, asc }) {
  if (!active) return <UnfoldMoreIcon sx={{ fontSize: 13, opacity: 0.3 }} />
  return asc
    ? <ArrowDropUpIcon sx={{ fontSize: 14 }} />
    : <ArrowDropDownIcon sx={{ fontSize: 14 }} />
}

export default function FtpBrowser({
  open, onClose,
  ftpHost, ftpPort = 21, ftpUsername = '', ftpPassword = '',
  ftpConnectionType = 'ftp', ftpPassive = true,
}) {
  const { accent, mode } = useThemeContext()
  const isDark = mode === 'dark'
  const pathInputRef = useRef(null)

  // navigation
  const [currentPath, setCurrentPath] = useState('/')
  const [history,     setHistory]     = useState([])
  const [items,       setItems]       = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  // path bar
  const [pathDraft,   setPathDraft]   = useState('/')
  const [pathEditing, setPathEditing] = useState(false)

  // search / filter
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState('all')   // 'all' | 'dir' | 'file'

  // sort
  const [sort, setSort] = useState({ key: 'name', asc: true })

  // file viewer
  const [viewFile,    setViewFile]    = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError,   setFileError]   = useState(null)

  // copy feedback
  const [copied, setCopied] = useState(null)

  const creds = {
    ftp_host: ftpHost, ftp_port: ftpPort,
    ftp_username: ftpUsername, ftp_password: ftpPassword,
    ftp_connection_type: ftpConnectionType, ftp_passive: ftpPassive,
  }

  const browse = useCallback(async (path) => {
    const normPath = path || '/'
    setLoading(true)
    setError(null)
    setItems(null)
    setViewFile(null)
    setFileContent(null)
    setSearch('')
    setTypeFilter('all')
    setPathDraft(normPath)
    try {
      const res = await ftpBrowse({ ...creds, path: normPath })
      setItems(res.data.items || [])
      setCurrentPath(normPath)
    } catch (err) {
      setError(formatApiError(err, `Cannot list ${normPath}`))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ftpHost, ftpUsername, ftpPassword, ftpPort, ftpConnectionType, ftpPassive])

  useEffect(() => {
    if (open && ftpHost && ftpPassword) {
      setHistory([])
      browse('/')
    }
  }, [open]) // eslint-disable-line

  const navigateTo = useCallback((path) => {
    setHistory((h) => [...h, currentPath])
    browse(path)
  }, [currentPath, browse])

  const goBack = () => {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    browse(prev)
  }

  const goUp = () => {
    const up = parentPath(currentPath)
    if (up) navigateTo(up)
  }

  const commitPath = () => {
    const trimmed = pathDraft.trim() || '/'
    setPathEditing(false)
    if (trimmed !== currentPath) navigateTo(trimmed)
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
      setFileError(formatApiError(err, 'Failed to read file'))
    } finally {
      setFileLoading(false)
    }
  }

  const copyPath = (path) => {
    navigator.clipboard.writeText(path).catch(() => {})
    setCopied(path)
    setTimeout(() => setCopied(null), 1500)
  }

  const toggleSort = (key) => {
    setSort((s) => s.key === key ? { key, asc: !s.asc } : { key, asc: true })
  }

  // ── derived list ─────────────────────────────────────────────────────────────
  const filtered = (items || [])
    .filter((it) => typeFilter === 'all' || it.type === typeFilter)
    .filter((it) => !search || it.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      // dirs always first
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      const mul = sort.asc ? 1 : -1
      if (sort.key === 'size') return mul * ((a.size ?? -1) - (b.size ?? -1))
      if (sort.key === 'modified') return mul * ((a.modified ?? '').localeCompare(b.modified ?? ''))
      return mul * a.name.localeCompare(b.name)
    })

  const protocol = ftpConnectionType === 'ftps' ? 'FTPS' : 'FTP'
  const canGoUp  = currentPath !== '/' && currentPath !== ''
  const dirCount  = (items || []).filter((i) => i.type === 'dir').length
  const fileCount = (items || []).filter((i) => i.type === 'file').length

  const colSx = {
    px: 2, py: 0.75, fontFamily: '"Raleway", sans-serif', fontSize: '0.55rem',
    letterSpacing: '0.18em', textTransform: 'uppercase', color: 'text.disabled',
    fontWeight: 700, cursor: 'pointer', userSelect: 'none',
    display: 'flex', alignItems: 'center', gap: 0.5,
    '&:hover': { color: accent },
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          border: `1px solid ${accent}33`,
          borderRadius: '2px',
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      {/* accent bar */}
      <Box sx={{ height: 2, flexShrink: 0, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

        {/* ── Toolbar ── */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          px: 1.5, py: 1,
          borderBottom: `1px solid ${accent}1f`,
          bgcolor: `${accent}05`,
          flexShrink: 0,
        }}>
          {/* nav buttons */}
          <Tooltip title="Back" arrow>
            <span>
              <IconButton size="small" onClick={goBack} disabled={history.length === 0}
                aria-label="Back"
                sx={{ color: history.length ? accent : 'text.disabled' }}>
                <ArrowBackIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Parent directory" arrow>
            <span>
              <IconButton size="small" onClick={goUp} disabled={!canGoUp}
                aria-label="Parent directory"
                sx={{ color: canGoUp ? accent : 'text.disabled' }}>
                <ArrowUpwardIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Home (/)" arrow>
            <IconButton size="small" onClick={() => { setHistory([]); browse('/') }} aria-label="Home" sx={{ color: accent }}>
              <HomeIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh" arrow>
            <IconButton size="small" onClick={() => browse(currentPath)} aria-label="Refresh" sx={{ color: accent }}>
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>

          {/* path bar */}
          <Box
            onClick={() => { setPathEditing(true); setTimeout(() => pathInputRef.current?.select(), 10) }}
            sx={{
              flex: 1, mx: 0.5, px: 1.5, py: 0.6,
              border: `1px solid ${pathEditing ? accent : `${accent}33`}`,
              borderRadius: '3px',
              bgcolor: pathEditing ? `${accent}08` : `${accent}04`,
              cursor: pathEditing ? 'text' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 1,
              transition: 'all 0.15s',
              '&:hover': { borderColor: `${accent}66` },
            }}
          >
            <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.65rem', color: 'text.disabled', flexShrink: 0 }}>
              {protocol}://
            </Typography>
            <InputBase
              inputRef={pathInputRef}
              value={pathEditing ? pathDraft : currentPath}
              onChange={(e) => setPathDraft(e.target.value)}
              onFocus={() => { setPathEditing(true); setPathDraft(currentPath) }}
              onBlur={() => { setPathEditing(false); setPathDraft(currentPath) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.target.blur(); commitPath() }
                if (e.key === 'Escape') { setPathEditing(false); setPathDraft(currentPath); e.target.blur() }
              }}
              sx={{
                flex: 1,
                '& input': {
                  fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem',
                  color: 'text.primary', p: 0, height: 'auto',
                },
              }}
            />
            <Tooltip title={copied === currentPath ? 'Copied!' : 'Copy path'} arrow>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); copyPath(currentPath) }}
                aria-label="Copy path"
                sx={{ color: copied === currentPath ? '#6b8f71' : 'text.disabled', p: 0.25, '&:hover': { color: accent } }}>
                <ContentCopyIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* search */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            px: 1, py: 0.5,
            border: `1px solid ${search ? accent : `${accent}22`}`,
            borderRadius: '3px',
            bgcolor: search ? `${accent}08` : 'transparent',
            width: 180, transition: 'all 0.15s',
          }}>
            <SearchIcon sx={{ fontSize: 14, color: search ? accent : 'text.disabled', flexShrink: 0 }} />
            <InputBase
              placeholder="Filter files…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{
                flex: 1,
                '& input': {
                  fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem',
                  color: 'text.primary', p: 0, height: 'auto',
                  '&::placeholder': { color: 'text.disabled', opacity: 1 },
                },
              }}
            />
            {search && (
              <IconButton size="small" onClick={() => setSearch('')}
                aria-label="Clear search"
                sx={{ color: 'text.disabled', p: 0.25, '&:hover': { color: accent } }}>
                <CloseIcon sx={{ fontSize: 12 }} />
              </IconButton>
            )}
          </Box>

          {/* type filter chips */}
          {['all', 'dir', 'file'].map((f) => (
            <Chip
              key={f}
              label={f === 'all' ? 'All' : f === 'dir' ? 'Folders' : 'Files'}
              size="small"
              onClick={() => setTypeFilter(f)}
              sx={{
                height: 22, fontSize: '0.6rem', fontFamily: '"Raleway", sans-serif',
                bgcolor: typeFilter === f ? `${accent}22` : 'transparent',
                color: typeFilter === f ? accent : 'text.disabled',
                border: `1px solid ${typeFilter === f ? `${accent}55` : `${accent}18`}`,
                cursor: 'pointer',
                '&:hover': { bgcolor: `${accent}14`, color: accent },
              }}
            />
          ))}

          {/* server info + close */}
          <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.58rem', color: 'text.disabled', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
            {ftpHost}
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ color: 'text.disabled', '&:hover': { color: accent } }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>

        {/* ── Body ── */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* File list pane */}
          <Box sx={{ flex: viewFile ? '0 0 48%' : '1', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: viewFile ? `1px solid ${accent}1f` : 'none' }}>

            {/* Column headers */}
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', flexShrink: 0 }}>
              <Box component="thead">
                <Box component="tr" sx={{ borderBottom: `1px solid ${accent}18`, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                  <Box component="th" onClick={() => toggleSort('name')} sx={{ ...colSx, width: '100%' }}>
                    Name <SortIcon active={sort.key === 'name'} asc={sort.asc} />
                  </Box>
                  <Box component="th" onClick={() => toggleSort('size')} sx={{ ...colSx, whiteSpace: 'nowrap' }}>
                    Size <SortIcon active={sort.key === 'size'} asc={sort.asc} />
                  </Box>
                  <Box component="th" onClick={() => toggleSort('modified')} sx={{ ...colSx, whiteSpace: 'nowrap' }}>
                    Modified <SortIcon active={sort.key === 'modified'} asc={sort.asc} />
                  </Box>
                  <Box component="th" sx={{ ...colSx, cursor: 'default', '&:hover': {} }} />
                </Box>
              </Box>
            </Box>

            {/* Rows */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
                  <MythicsLoader size={48} />
                </Box>
              )}
              {error && (
                <Box sx={{ px: 3, pt: 4, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.72rem', color: '#c98f8f' }}>
                    {error}
                  </Typography>
                  <Typography
                    component="button"
                    onClick={() => browse(currentPath)}
                    sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.65rem', color: accent, border: 'none', bgcolor: 'transparent', cursor: 'pointer', textDecoration: 'underline', p: 0, width: 'fit-content' }}
                  >
                    Retry
                  </Typography>
                </Box>
              )}
              {!loading && !error && items !== null && (
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
                  <Box component="tbody">
                    {canGoUp && (
                      <Box component="tr"
                        onClick={goUp}
                        sx={{ cursor: 'pointer', borderBottom: `1px solid ${accent}0a`, '&:hover': { bgcolor: `${accent}09` } }}>
                        <Box component="td" sx={{ px: 2, py: 0.85, display: 'flex', alignItems: 'center', gap: 1.2, width: '100%' }}>
                          <ArrowUpwardIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                          <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', color: 'text.disabled' }}>
                            ..
                          </Typography>
                        </Box>
                        <Box component="td" /><Box component="td" /><Box component="td" />
                      </Box>
                    )}
                    {filtered.length === 0 && (
                      <Box component="tr">
                        <Box component="td" colSpan={4} sx={{ px: 2.5, py: 4, fontFamily: '"Raleway", sans-serif', fontSize: '0.7rem', color: 'text.disabled', textAlign: 'center' }}>
                          {search ? `No items matching "${search}"` : 'Empty directory'}
                        </Box>
                      </Box>
                    )}
                    {filtered.map((item) => {
                      const isDir    = item.type === 'dir'
                      const itemPath = joinFtpPath(currentPath, item.name)
                      const canOpen  = !isDir && isTextFile(item.name)
                      const isActive = viewFile?.path === itemPath
                      return (
                        <Box key={item.name} component="tr"
                          onClick={() => isDir ? navigateTo(itemPath) : canOpen ? openFile(itemPath, item.name) : undefined}
                          sx={{
                            cursor: isDir || canOpen ? 'pointer' : 'default',
                            borderBottom: `1px solid ${accent}0a`,
                            bgcolor: isActive ? `${accent}12` : 'transparent',
                            '&:hover': { bgcolor: `${accent}09` },
                            '&:hover .copy-btn': { opacity: 1 },
                          }}>
                          {/* name */}
                          <Box component="td" sx={{ px: 2, py: 0.85, display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0 }}>
                            {isDir
                              ? <FolderIcon sx={{ fontSize: 15, color: accent, flexShrink: 0 }} />
                              : canOpen
                                ? <ArticleIcon sx={{ fontSize: 15, color: accent, flexShrink: 0 }} />
                                : <InsertDriveFileIcon sx={{ fontSize: 15, color: 'text.disabled', flexShrink: 0 }} />
                            }
                            <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: isDir ? accent : 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.name}
                            </Typography>
                          </Box>
                          {/* size */}
                          <Box component="td" sx={{ px: 1.5, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.65rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                            {isDir ? '—' : (formatSize(item.size) || '—')}
                          </Box>
                          {/* modified */}
                          <Box component="td" sx={{ px: 1.5, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.65rem', color: 'text.disabled', whiteSpace: 'nowrap' }}>
                            {formatDate(item.modified) || '—'}
                          </Box>
                          {/* copy */}
                          <Box component="td" sx={{ px: 1, whiteSpace: 'nowrap' }}>
                            <Tooltip title={copied === itemPath ? 'Copied!' : 'Copy path'} arrow>
                              <IconButton
                                className="copy-btn"
                                size="small"
                                onClick={(e) => { e.stopPropagation(); copyPath(itemPath) }}
                                aria-label="Copy path"
                                sx={{ opacity: 0, color: copied === itemPath ? '#6b8f71' : 'text.disabled', p: 0.4, transition: 'opacity 0.15s', '&:hover': { color: accent } }}
                              >
                                <ContentCopyIcon sx={{ fontSize: 12 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                      )
                    })}
                  </Box>
                </Box>
              )}
            </Box>

            {/* Status bar */}
            <Box sx={{ px: 2, py: 0.6, borderTop: `1px solid ${accent}10`, bgcolor: isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', color: 'text.disabled' }}>
                {items === null ? '' : search || typeFilter !== 'all'
                  ? `${filtered.length} of ${items.length} items`
                  : `${dirCount} folder${dirCount !== 1 ? 's' : ''}  ·  ${fileCount} file${fileCount !== 1 ? 's' : ''}`
                }
              </Typography>
              {(search || typeFilter !== 'all') && (
                <Typography
                  component="button"
                  onClick={() => { setSearch(''); setTypeFilter('all') }}
                  sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.6rem', color: accent, border: 'none', bgcolor: 'transparent', cursor: 'pointer', p: 0, textDecoration: 'underline' }}
                >
                  Clear filters
                </Typography>
              )}
            </Box>
          </Box>

          {/* ── File viewer pane ── */}
          {viewFile && (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* viewer header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderBottom: `1px solid ${accent}1f`, bgcolor: `${accent}04`, flexShrink: 0 }}>
                <ArticleIcon sx={{ fontSize: 14, color: accent }} />
                <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.68rem', color: 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {viewFile.path}
                </Typography>
                <Tooltip title={copied === viewFile.path ? 'Copied!' : 'Copy path'} arrow>
                  <IconButton size="small" onClick={() => copyPath(viewFile.path)}
                    aria-label="Copy path"
                    sx={{ color: copied === viewFile.path ? '#6b8f71' : 'text.disabled', p: 0.4, '&:hover': { color: accent } }}>
                    <ContentCopyIcon sx={{ fontSize: 13 }} />
                  </IconButton>
                </Tooltip>
                <IconButton size="small" onClick={() => setViewFile(null)} aria-label="Close file viewer" sx={{ color: 'text.disabled', '&:hover': { color: accent } }}>
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
