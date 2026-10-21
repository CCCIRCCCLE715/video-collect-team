import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('team_import', Path(__file__).resolve().parents[1] / 'scripts/team_import.py')
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)

class ImportTests(unittest.TestCase):
    def test_rounded_like_label_and_duration_are_preserved(self):
        data = tool.make_payload({'entry_type': 'reference', 'url': 'https://www.douyin.com/video/123456789', 'likes': None, 'likes_label': '4.1万', 'duration': 15}, Path('.'))
        self.assertEqual(data['topic']['likes_label'], '4.1万')
        self.assertIsNone(data['topic']['likes'])
        self.assertEqual(data['topic']['duration'], 15)

    def test_payload_has_metadata_and_original_cover_but_no_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / 'cover.jpg').write_bytes(b'\xff\xd8\xff\x00')
            data = tool.make_payload({'entry_type': 'reference', 'url': 'https://www.instagram.com/reel/Abc123/', 'title': '示例', 'poster': 'cover.jpg', 'cookies': 'private', 'video': '/private/movie.mp4', 'created_by': 'someone'}, base)
            self.assertEqual(set(data['topic']), {'entry_type', 'url', 'title'})
            self.assertEqual(data['cover']['mime'], 'image/jpeg')
            self.assertNotIn('private', json.dumps(data))

    def test_missing_or_remote_cover_is_not_reported_as_saved(self):
        with tempfile.TemporaryDirectory() as tmp:
            for poster in ('missing.jpg', 'https://example.com/cover.jpg', '../private.jpg'):
                with self.assertRaises((ValueError, OSError)):
                    tool.make_payload({'entry_type': 'reference', 'url': 'https://www.instagram.com/reel/Abc123/', 'poster': poster}, Path(tmp))

    def test_category_and_suggestion_are_required_before_network_access(self):
        with self.assertRaisesRegex(ValueError, '参考视频'):
            tool.make_payload({'url': 'https://www.instagram.com/reel/Test/'}, Path('.'))
        for suggestion in ('', '  ', 9, 'x' * 4001):
            with self.assertRaisesRegex(ValueError, '选题建议'):
                tool.make_payload({'url': 'https://www.instagram.com/reel/Test/', 'entry_type': 'topic', 'topic_suggestion': suggestion}, Path('.'))
        value = tool.make_payload({'url': 'https://www.instagram.com/reel/Test/', 'entry_type': 'topic', 'topic_suggestion': '做一期案例拆解'}, Path('.'))
        self.assertEqual(value['topic']['topic_suggestion'], '做一期案例拆解')

    def test_send_requires_positive_server_confirmation(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b'{"ok": false}'
        with self.assertRaisesRegex(ValueError, '未确认'):
            tool.send('https://example.supabase.co', 'member-token', {'topic': {}}, opener=lambda *a, **k: Response())

if __name__ == '__main__': unittest.main()
