# Dockerfile for Ktor (Kotlin/Java) project
#
# This multi‑stage build will compile your Ktor server with Gradle in one
# stage and produce a small final image containing only the JRE and the
# generated runnable JAR. Adjust the Gradle version or Java version as
# needed for your project.

# ---------- Build stage ----------
FROM gradle:8.6-jdk17 AS build
# Set a working directory inside the container
WORKDIR /home/app

# Copy all project files into the container
COPY . .

# Run the Gradle build. Skip tests to speed up the build and avoid
# requiring test dependencies on the build server. Feel free to remove
# `-x test` if you want tests to run during container builds.
RUN gradle clean build -x test --no-daemon

# ---------- Runtime stage ----------
FROM openjdk:17-jdk-slim
WORKDIR /app

# Copy the built JAR from the build stage into the runtime image.
# The JAR is expected to reside in build/libs/ after a successful
# Gradle build. Copying with a wildcard ensures the final image still
# builds even if the exact file name changes (for example, if you
# configure the project to produce an "all" or "fat" JAR).
COPY --from=build /home/app/build/libs/*.jar ./app.jar

# Expose the port your Ktor application listens on. The default Ktor
# port is 8080. If you configure a different port in your application
# or via environment variables, adjust this line accordingly.
EXPOSE 8080

# Define the default command to run your application. When the
# container starts, it will execute this command and run your Ktor
# server. Using the built‑in OpenJDK runtime, the `java -jar` command
# will launch your server from the app.jar file copied above.
CMD ["java", "-jar", "app.jar"]