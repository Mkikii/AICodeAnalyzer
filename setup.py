from setuptools import setup, find_packages

setup(
    name='ai-toolkit',
    version='0.1.0',
    author='Your Name',
    author_email='your.email@example.com',
    description='A toolkit for AI developers to streamline their workflows.',
    packages=find_packages(where='src'),
    package_dir={'': 'src'},
    install_requires=[
        # List your library dependencies here
    ],
    classifiers=[
        'Programming Language :: Python :: 3',
        'License :: OSI Approved :: MIT License',
        'Operating System :: OS Independent',
    ],
    python_requires='>=3.6',
    entry_points={
        'console_scripts': [
            'ai-toolkit=ai_toolkit.code_analyzer:main'
        ]
    },
)