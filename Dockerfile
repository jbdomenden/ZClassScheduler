# ---------- Build stage ----------
FROM gradle:8.6-jdk17 AS build
WORKDIR /home/app
COPY . .
RUN gradle clean build -x test --no-daemon

# ---------- Runtime stage ----------
# Use Eclipse Temurin for the runtime stage.
FROM eclipse-temurin:17
WORKDIR /app
COPY --from=build /home/app/build/libs/*.jar ./app.jar
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]