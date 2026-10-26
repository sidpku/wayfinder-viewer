import json
from pathlib import Path
import tempfile
import unittest
from server import SnapshotStore, parse_target, export_html


class CacheTests(unittest.TestCase):
    def test_failed_refresh_preserves_last_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SnapshotStore(Path(directory))
            value = {'repo': 'a/b', 'map': {'number': 1}, 'fetchedAt': 'before'}
            store.save('a/b', 1, value)
            def broken(repo, number):
                raise RuntimeError('网络中断')
            with self.assertRaises(RuntimeError):
                store.refresh('a/b', 1, broken)
            self.assertEqual(store.read('a/b', 1), value)

    def test_invalid_targets_are_rejected(self):
        self.assertEqual(parse_target({'repo':['owner/repo'], 'number':['1']}), ('owner/repo', 1))
        for value in ['0', '-1', 'foo', '1;ls']:
            with self.assertRaises(ValueError):
                parse_target({'repo':['a/b'], 'number':[value]})

    def test_missing_repository_never_uses_a_personal_default(self):
        for query in ({}, {'number': ['1']}, {'repo': ['']}):
            with self.assertRaises(ValueError):
                parse_target(query)

    def test_export_cannot_break_out_of_json_script(self):
        value = {'map': {'body': '</script><script>alert(1)</script>'}}
        html = export_html(value)
        self.assertNotIn('</script><script>alert(1)', html)
        self.assertIn('window.WAYFINDER_SNAPSHOT', html)


if __name__ == '__main__':
    unittest.main()
