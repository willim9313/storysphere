"""classify_task_failure：整本失敗的分類（TaskStatus.errorKind）。

檔案本身的性質（加密、損毀）每次重試都會一樣失敗；其餘歸 internal，重試可能會過。
例外要在還是物件時分類——task.error 只留 str(exc)，型別就沒了。
"""

from __future__ import annotations

import zipfile

from pypdf.errors import EmptyFileError, FileNotDecryptedError, PdfReadError, PdfStreamError
from storysphere.core.error_handling import classify_task_failure


class TestClassifyTaskFailure:
    def test_pdf_with_a_user_password_is_encrypted(self):
        assert classify_task_failure(FileNotDecryptedError("File has not been decrypted")) == "encrypted"

    def test_corrupt_or_empty_pdf_is_unreadable(self):
        for exc in (PdfReadError("EOF marker not found"), PdfStreamError("x"), EmptyFileError("Cannot read an empty file")):
            assert classify_task_failure(exc) == "unreadable"

    def test_broken_docx_is_unreadable(self):
        from docx.opc.exceptions import PackageNotFoundError

        assert classify_task_failure(PackageNotFoundError("Package not found at '/tmp/x.docx'")) == "unreadable"
        assert classify_task_failure(zipfile.BadZipFile("File is not a zip file")) == "unreadable"

    def test_broken_epub_is_unreadable(self):
        assert classify_task_failure(ValueError("Could not parse EPUB: bad zip")) == "unreadable"

    def test_wrapped_file_error_is_still_found(self):
        try:
            try:
                raise FileNotDecryptedError("File has not been decrypted")
            except FileNotDecryptedError as inner:
                raise RuntimeError("node failed") from inner
        except RuntimeError as outer:
            assert classify_task_failure(outer) == "encrypted"

    def test_anything_else_is_internal(self):
        assert classify_task_failure(ValueError("Document 'x' not found")) == "internal"
        assert classify_task_failure(RuntimeError("database is locked")) == "internal"
