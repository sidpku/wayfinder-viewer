import unittest
from model import classify, build_snapshot, sections


def issue(number, state='open', assignees=None):
    return {'number': number, 'state': state, 'assignees': assignees or [], 'title': f'决策 {number}', 'labels': [], 'html_url': f'https://github.com/a/b/issues/{number}'}


class StateTests(unittest.TestCase):
    def test_frontier_requires_open_unassigned_and_closed_blockers(self):
        self.assertEqual(classify(issue(2), [issue(3, 'closed')]), 'frontier')
        self.assertEqual(classify(issue(2), [issue(3)]), 'blocked')
        self.assertEqual(classify(issue(2, assignees=[{'login': 'owner'}]), []), 'claimed')
        self.assertEqual(classify(issue(2, 'closed'), [issue(3)]), 'closed')

    def test_incomplete_dependencies_never_become_frontier(self):
        self.assertEqual(classify(issue(2), [], known=False), 'unknown')
        self.assertEqual(classify(issue(2), [{'number': 3}]), 'unknown')

    def test_external_blocker_is_included_and_frontier_order_is_preserved(self):
        children = [issue(4), issue(2), issue(3)]
        snapshot = build_snapshot('a/b', issue(1), children,
                                  {'a/b#4': [], 'a/b#2': [issue(90)], 'a/b#3': []}, {}, [])
        self.assertEqual(snapshot['frontier'], ['a/b#4', 'a/b#3'])
        self.assertEqual(snapshot['external'][0]['number'], 90)
        self.assertEqual(snapshot['issues'][1]['status'], 'blocked')
        self.assertEqual(snapshot['edges'], [{'source': 'a/b#90', 'target': 'a/b#2'}])

    def test_failed_dependency_read_is_explicit(self):
        snapshot = build_snapshot('a/b', issue(1), [issue(2)], {}, {}, ['依赖读取失败'])
        self.assertEqual(snapshot['issues'][0]['status'], 'unknown')
        self.assertEqual(snapshot['frontier'], [])

    def test_cross_repo_blocker_with_same_number_is_a_separate_node(self):
        local_closed = issue(3, 'closed')
        external_open = issue(3)
        external_open['html_url'] = 'https://github.com/a/other/issues/3'
        snapshot = build_snapshot('a/b', issue(1), [issue(2), local_closed],
                                  {'a/b#2': [external_open], 'a/b#3': []}, {}, [])
        self.assertEqual(snapshot['issues'][0]['status'], 'blocked')
        self.assertEqual(snapshot['external'][0]['key'], 'a/other#3')
        self.assertEqual(snapshot['edges'], [{'source': 'a/other#3', 'target': 'a/b#2'}])

    def test_sections_ignore_heading_text_inside_fenced_code(self):
        body = '## Destination\n终点\n```md\n## Notes\n不是段落\n```\n## Notes\n约束'
        self.assertIn('不是段落', sections(body)['Destination'])
        self.assertEqual(sections(body)['Notes'], '约束')


if __name__ == '__main__':
    unittest.main()
