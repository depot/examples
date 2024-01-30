A multi-stage Dockerfile like the one shown here starts to harness parallelization capabilities of BuildKit.

BuildKit can determine the dependencies between each stage in the build process. If two stages can be run in parallel, they will be. Stages are a great way to break your Docker image build up into parallelizable steps — for example, you could install your dependencies, build your application at the same time, and then combine the two to form your final image.

You can read more about what's happening under the hood in our [BuildKit in depth]() blog post.
