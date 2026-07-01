import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    mock = MagicMock()
    mock.sftp_host = "ssh.test.com"
    mock.sftp_port = 22
    mock.sftp_username = "user"
    mock.sftp_password = "pass"
    mock.sftp_remote_path = "/output.csv"
    monkeypatch.setattr("scp_client.get_settings", lambda: mock)


TEST_CSV = b"name,age\nAlice,30\nBob,25"


def _make_channel(data: bytes = TEST_CSV, err: bytes = b""):
    stdout = MagicMock()
    stdout.read.return_value = data
    stderr = MagicMock()
    stderr.read.return_value = err
    return MagicMock(), stdout, stderr


def test_download_csv_returns_bytes():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh
        mock_ssh.exec_command.return_value = _make_channel(TEST_CSV)

        from scp_client import download_csv
        result = download_csv()
        assert result == TEST_CSV


def test_download_csv_uses_default_path():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh
        mock_ssh.exec_command.return_value = _make_channel(TEST_CSV)

        from scp_client import download_csv
        download_csv()
        cmd = mock_ssh.exec_command.call_args[0][0]
        assert "/output.csv" in cmd


def test_download_csv_uses_explicit_remote_path():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh
        mock_ssh.exec_command.return_value = _make_channel(TEST_CSV)

        from scp_client import download_csv
        download_csv(remote_path="/reports/87694/output.csv")
        cmd = mock_ssh.exec_command.call_args[0][0]
        assert "/reports/87694/output.csv" in cmd


def test_download_csv_raises_on_stderr():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh
        mock_ssh.exec_command.return_value = _make_channel(b"", b"No such file")

        from scp_client import download_csv
        with pytest.raises(RuntimeError, match="No such file"):
            download_csv()


def test_download_csv_quotes_path_against_shell_injection():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh
        mock_ssh.exec_command.return_value = _make_channel(TEST_CSV)

        from scp_client import download_csv
        download_csv(remote_path="/tmp/report.csv; rm -rf ~")
        cmd = mock_ssh.exec_command.call_args[0][0]
        assert cmd == "cat '/tmp/report.csv; rm -rf ~'"


def test_download_csv_closes_connection():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh
        mock_ssh.exec_command.return_value = _make_channel(TEST_CSV)

        from scp_client import download_csv
        download_csv()
        mock_ssh.close.assert_called_once()
