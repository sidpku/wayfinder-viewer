import unittest
from github import decode_pages, validate_repo, load_map
from unittest.mock import patch


class GithubTests(unittest.TestCase):
    def test_all_slurped_pages_are_preserved_in_order(self):
        self.assertEqual(decode_pages('[[{"number":2}],[{"number":3}]]'), [{'number': 2}, {'number': 3}])
        self.assertEqual(decode_pages('[[]]'), [])

    def test_cross_repository_children_use_their_own_api_paths(self):
        calls = []
        root = {'number': 1, 'title': '地图', 'labels': [{'name':'wayfinder:map'}]}
        child = {'number': 2, 'title': '外部决策', 'state': 'open', 'assignees': [], 'labels': [],
                 'comments': 1, 'html_url': 'https://github.com/a/other/issues/2'}
        blocker = {'number': 8, 'title': '前置', 'state': 'open', 'html_url': 'https://github.com/a/other/issues/8'}
        def read(endpoint, paged=False):
            calls.append(endpoint)
            if endpoint == 'repos/a/b/issues/1': return root
            if '/sub_issues' in endpoint: return [child]
            if endpoint == 'repos/a/other/issues/2/dependencies/blocked_by?per_page=100': return [blocker]
            if endpoint == 'repos/a/other/issues/2/comments?per_page=100': return []
            return []
        with patch('github.gh', side_effect=read):
            snapshot = load_map('a/b', 1)
        self.assertEqual(snapshot['issues'][0]['status'], 'blocked')
        self.assertIn('repos/a/other/issues/2/comments?per_page=100', calls)

    def test_repo_rejects_paths_and_command_options(self):
        self.assertEqual(validate_repo('sidpku/DSAaaS'), 'sidpku/DSAaaS')
        for value in ['../x', '-q/x', 'a/b/c', 'https://github.com/a/b', 'a/b?x=y']:
            with self.assertRaises(ValueError):
                validate_repo(value)


if __name__ == '__main__':
    unittest.main()
