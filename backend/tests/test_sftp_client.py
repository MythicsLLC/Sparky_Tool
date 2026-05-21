import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    mock = MagicMock()
    mock.sftp_host = "sftp.test.com"
    mock.sftp_port = 22
    mock.sftp_username = "user"
    mock.sftp_password = "pass"
    mock.sftp_remote_path = "/output.csv"
    monkeypatch.setattr("sftp_client.settings", mock)


TEST_CSV = b"name,age\nAlice,30\nBob,25"


def test_download_csv_returns_bytes():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh

        mock_sftp = MagicMock()
        mock_ssh.open_sftp.return_value = mock_sftp

        def fake_getfo(path, buf):
            buf.write(TEST_CSV)

        mock_sftp.getfo.side_effect = fake_getfo

        from sftp_client import download_csv
        result = download_csv()
        assert result == TEST_CSV


def test_download_csv_closes_connection_on_success():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh
        mock_ssh.open_sftp.return_value.getfo = lambda p, b: b.write(TEST_CSV)

        from sftp_client import download_csv
        download_csv()
        mock_ssh.close.assert_called_once()


def test_download_csv_closes_connection_on_error():
    with patch("paramiko.SSHClient") as mock_ssh_cls:
        mock_ssh = MagicMock()
        mock_ssh_cls.return_value = mock_ssh
        mock_ssh.connect.side_effect = Exception("connection refused")

        from sftp_client import download_csv
        with pytest.raises(Exception, match="connection refused"):
            download_csv()
        mock_ssh.close.assert_called_once()
